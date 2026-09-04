"""SONAR worker entrypoint.

One worker serves every way in: a browser joining over WebRTC, an inbound phone call
bridged by LiveKit SIP, and an outbound call this agent placed. They are all just
participants in a room, so the only thing that differs is the opening line.

    python main.py dev      # development, auto-reloads
    python main.py start    # production
    python main.py download-files   # fetch Silero + turn-detector weights first
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    MetricsCollectedEvent,
    WorkerOptions,
    cli,
    mcp,
    metrics,
)
from livekit.agents.voice.room_io import RoomOptions
from livekit.plugins import silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from config import build_llm, build_stt, build_tts, settings
from metrics_sink import MetricsSink
from prompts import GREETING_INBOUND, GREETING_OUTBOUND, SYSTEM_PROMPT

load_dotenv(dotenv_path=str(Path(__file__).resolve().parent.parent / ".env"))

# We log model output, and a model will eventually emit a character the Windows console
# codepage cannot encode — a non-breaking hyphen crashed the logger during stage 3. The
# fix belongs here rather than in any one string, because the next one will be different.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(level=settings.log_level)
log = logging.getLogger("sonar")

# LiveKit reports outbound call progress on the SIP participant under this key.
SIP_STATUS_ATTR = "sip.callStatus"


def prewarm(proc: JobProcess) -> None:
    """Load the VAD once per process, not once per call."""
    proc.userdata["vad"] = silero.VAD.load()


class HeliosAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=SYSTEM_PROMPT,
            # The tool server is a separate process; give it room to cold-start without
            # the first caller hearing dead air.
            tools=[
                mcp.MCPToolset(
                    id="sonar-tools",
                    mcp_server=mcp.MCPServerHTTP(
                        url=settings.mcp_server_url, client_session_timeout_seconds=30
                    ),
                )
            ],
        )


def _call_context(ctx: JobContext) -> dict:
    """Outbound calls carry their brief as room metadata; everything else is inbound."""
    try:
        return json.loads(ctx.room.metadata or "{}")
    except json.JSONDecodeError:
        log.warning("room metadata was not valid JSON; treating as an inbound call")
        return {}


async def wait_until_answered(
    ctx: JobContext, number: str, timeout: float = 60.0, poll_interval: float = 0.15
) -> bool:
    """Block until the person we rang actually picks up.

    `createSipParticipant` returns while the phone is still ringing, so without this the
    agent greets an unanswered line, finishes, and is sitting silently by the time the
    callee says hello. That is exactly what a real test call produced: the caller picked
    up, heard nothing, said "hello, is anyone there", and hung up.

    LiveKit reports progress on the SIP participant as `sip.callStatus`: `dialing` while
    ringing, `active` once answered, `automation` while sending DTMF, `hangup` if it
    ends. Returns False if the call is never answered.
    """
    log.info("outbound call to %s: waiting for an answer", number)
    try:
        participant = await asyncio.wait_for(
            ctx.wait_for_participant(kind=rtc.ParticipantKind.PARTICIPANT_KIND_SIP),
            timeout=timeout,
        )
    except TimeoutError:
        log.warning("no SIP participant joined within %.0fs", timeout)
        return False

    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    # sip.callStatus has been reported empty on some deployments. If it never appears,
    # fall back to the presence of published audio: media only flows once the call is up.
    fallback_after = loop.time() + min(8.0, timeout / 2)
    last = None

    while loop.time() < deadline:
        status = participant.attributes.get(SIP_STATUS_ATTR)
        if status != last:
            log.info("sip.callStatus=%s", status)
            last = status
        if status in ("active", "automation"):
            return True
        if status == "hangup":
            log.info("callee hung up before answering")
            return False
        if status is None and loop.time() > fallback_after and _has_audio(participant):
            log.warning("sip.callStatus never appeared; treating published audio as answered")
            return True
        await asyncio.sleep(poll_interval)

    log.warning("call was never answered within %.0fs (last status %s)", timeout, last)
    return False


def _has_audio(participant) -> bool:
    return any(
        pub.kind == rtc.TrackKind.KIND_AUDIO
        for pub in getattr(participant, "track_publications", {}).values()
    )


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    meta = _call_context(ctx)
    outbound = bool(meta.get("phone_number"))

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=build_stt(),
        llm=build_llm(),
        tts=build_tts(),
        turn_detection=MultilingualModel(),
        allow_interruptions=True,
        min_interruption_duration=0.5,
        min_endpointing_delay=settings.min_endpointing_delay,
        max_endpointing_delay=3.0,
    )

    sink = MetricsSink(room=ctx.room, jsonl_path=settings.metrics_jsonl)

    @session.on("metrics_collected")
    def _on_metrics(ev: MetricsCollectedEvent) -> None:
        metrics.log_metrics(ev.metrics)
        sink.ingest(ev.metrics)

    # An outbound call must not be greeted until it is answered, so the wait happens
    # before the session starts rather than before the greeting: starting the session
    # opens the TTS connection and audio pipeline, and none of that should run against
    # a ringing line.
    greeting = GREETING_INBOUND
    if outbound:
        if not await wait_until_answered(ctx, meta["phone_number"]):
            log.info("ending job: outbound call was not answered")
            ctx.shutdown(reason="not answered")
            return
        # The reason for the call is written by whoever triggered it, so give it to the
        # model as instructions rather than trusting it to be a well-formed sentence.
        greeting = f"{GREETING_OUTBOUND}\n\nReason for this call: {meta.get('reason', 'a follow-up')}"

    await session.start(room=ctx.room, agent=HeliosAgent(), room_options=RoomOptions())
    log.info("session started (%s)", "outbound" if outbound else "inbound/web")

    # A failure here is the difference between a working agent and a silent phone line,
    # so it must be loud rather than an unhandled task exception nobody sees.
    try:
        await session.generate_reply(instructions=greeting)
        log.info("greeting delivered")
    except Exception:
        log.exception("greeting failed; the caller is hearing silence")
        raise


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            port=settings.worker_http_port,
            # Dev defaults to zero warmed processes, so a job spins one up while the
            # phone is ringing. One idle process removes that from the call path.
            num_idle_processes=1,
        )
    )
