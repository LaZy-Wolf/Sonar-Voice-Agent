"""SONAR worker entrypoint.

One worker serves every way in: a browser joining over WebRTC, an inbound phone call
bridged by LiveKit SIP, and an outbound call this agent placed. They are all just
participants in a room, so the only thing that differs is the opening line.

    python main.py dev      # development, auto-reloads
    python main.py start    # production
    python main.py download-files   # fetch Silero + turn-detector weights first
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    RoomInputOptions,
    WorkerOptions,
    cli,
    mcp,
)
from livekit.plugins import silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from config import build_llm, build_stt, build_tts, settings
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
        min_endpointing_delay=0.4,
        max_endpointing_delay=3.0,
    )

    await session.start(room=ctx.room, agent=HeliosAgent(), room_input_options=RoomInputOptions())

    greeting = GREETING_INBOUND
    if outbound:
        # The reason for the call is written by whoever triggered it, so give it to the
        # model as instructions rather than trusting it to be a well-formed sentence.
        greeting = f"{GREETING_OUTBOUND}\n\nReason for this call: {meta.get('reason', 'a follow-up')}"
    log.info("session started (%s)", "outbound" if outbound else "inbound/web")

    await session.generate_reply(instructions=greeting)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            port=settings.worker_http_port,
        )
    )
