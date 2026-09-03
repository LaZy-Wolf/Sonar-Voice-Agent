"""End-to-end check: join a room, say something, prove the agent answers.

    python scripts/smoke_call.py ["your question"]

Synthesises a question with Cartesia, publishes it into a fresh LiveKit room as if it
were a caller's microphone, then waits for the agent to speak back. Reports
time-to-first-audio and the transcript of both sides.

This is the only test that exercises the whole loop — LiveKit, Deepgram, the LLM,
the MCP tools and Cartesia — so it is what "the agent works" actually means. It needs
the MCP server and the worker already running.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import os
import sys
import time
import wave
from io import BytesIO
from pathlib import Path

import httpx
from dotenv import load_dotenv
from livekit import api, rtc

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

SAMPLE_RATE, CHANNELS, FRAME_MS = 24000, 1, 10
SPEECH_FRAMES = 8  # ~80ms of continuous energy before we call it speech
DEFAULT_QUESTION = "How long is the warranty on your solar panels?"


def env(key: str) -> str:
    return (os.getenv(key) or "").strip()


async def synthesise(text: str) -> bytes:
    """Cartesia speech as raw 24 kHz mono PCM, ready to push into an AudioSource."""
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(
            "https://api.cartesia.ai/tts/bytes",
            headers={"X-API-Key": env("CARTESIA_API_KEY"), "Cartesia-Version": "2024-06-10"},
            json={
                "model_id": env("CARTESIA_MODEL") or "sonic-3",
                "transcript": text,
                "voice": {"mode": "id", "id": env("CARTESIA_VOICE")},
                "output_format": {
                    "container": "wav",
                    "encoding": "pcm_s16le",
                    "sample_rate": SAMPLE_RATE,
                },
                "language": "en",
            },
        )
        r.raise_for_status()
    with wave.open(BytesIO(r.content)) as w:
        return w.readframes(w.getnframes())


async def main(question: str) -> int:
    room_name = f"sonar-smoke-{int(time.time())}"
    token = (
        api.AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"))
        .with_identity("smoke-caller")
        .with_grants(api.VideoGrants(room_join=True, room=room_name, can_publish=True,
                                     can_subscribe=True))
        .to_jwt()
    )

    print(f"question:  {question!r}")
    pcm = await synthesise(question)
    print(f"synthesised {len(pcm) / 2 / SAMPLE_RATE:.1f}s of audio")

    room = rtc.Room()
    agent_spoke = asyncio.Event()
    first_audio_at: list[float] = []
    transcript: list[str] = []
    metrics: list[dict] = []
    # Audio before this instant is the greeting, not an answer to us. Without the gate,
    # greeting frames get timed against a later question and TTFA comes out negative.
    gate = [float("inf")]
    last_loud = [0.0]

    @room.on("track_subscribed")
    def _on_track(track: rtc.Track, *_):
        if track.kind != rtc.TrackKind.KIND_AUDIO:
            return

        async def listen():
            # Require sustained energy, not one loud frame: a single blip of codec noise
            # was enough to register as "the agent replied" and produce a 1 ms TTFA.
            run = 0
            async for ev in rtc.AudioStream(track):
                data = ev.frame.data
                loud = any(
                    abs(int.from_bytes(data[i:i + 2], "little", signed=True)) > 500
                    for i in range(0, min(len(data), 960), 2)
                )
                run = run + 1 if loud else 0
                if run < SPEECH_FRAMES:
                    continue
                now = time.perf_counter()
                last_loud[0] = now
                if now > gate[0] and not first_audio_at:
                    # Credit the start of the run, not the frame that confirmed it.
                    first_audio_at.append(now - SPEECH_FRAMES * FRAME_MS / 1000)
                    agent_spoke.set()

        asyncio.create_task(listen())

    @room.on("transcription_received")
    def _on_tx(segments, participant=None, publication=None):
        for s in segments:
            if s.final:
                who = getattr(participant, "identity", "?")
                transcript.append(f"  [{who}] {s.text}")

    # The browser HUD reads these frames off the same topic. Capturing them here proves
    # the publish path over the wire, not just that the agent wrote a JSONL line.
    @room.on("data_received")
    def _on_data(packet: rtc.DataPacket):
        if packet.topic == "sonar.metrics":
            with contextlib.suppress(Exception):
                metrics.append(json.loads(packet.data.decode()))

    await room.connect(env("LIVEKIT_URL"), token)
    print(f"joined {room_name}; waiting for the agent to join...")

    for _ in range(200):  # 20s
        if room.remote_participants:
            break
        await asyncio.sleep(0.1)
    if not room.remote_participants:
        print("FAIL: no agent joined the room. Is the worker running?")
        await room.disconnect()
        return 1
    print(f"agent joined: {list(room.remote_participants)}")

    # Wait for the greeting to finish: 1.5s of quiet after the agent has actually spoken.
    print("waiting for the greeting to finish...")
    deadline = time.perf_counter() + 30
    while time.perf_counter() < deadline:
        quiet_for = time.perf_counter() - last_loud[0]
        if last_loud[0] and quiet_for > 1.5:
            break
        await asyncio.sleep(0.1)

    greeting_lines = len(transcript)   # anything after this belongs to our question

    source = rtc.AudioSource(SAMPLE_RATE, CHANNELS)
    track = rtc.LocalAudioTrack.create_audio_track("caller", source)
    await room.local_participant.publish_track(
        track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
    )

    print("speaking...")
    chunk = SAMPLE_RATE * FRAME_MS // 1000 * 2
    # Pace to a wall clock. Pushing the whole utterance at once makes VAD and the turn
    # detector see a burst instead of speech: the transcript comes back truncated and
    # any latency measured afterwards is fiction.
    started = time.perf_counter()
    for n, i in enumerate(range(0, len(pcm), chunk)):
        block = pcm[i:i + chunk].ljust(chunk, b"\x00")
        await source.capture_frame(rtc.AudioFrame(block, SAMPLE_RATE, CHANNELS, len(block) // 2))
        drift = started + (n + 1) * FRAME_MS / 1000 - time.perf_counter()
        if drift > 0:
            await asyncio.sleep(drift)
    spoke_at = time.perf_counter()
    gate[0] = spoke_at          # only audio after this counts as the reply

    # Wait for the answer itself, not a fixed sleep: disconnecting early was cutting the
    # session off mid-reply and making a working agent look broken.
    def agent_reply() -> str:
        return " ".join(
            line for line in transcript[greeting_lines:] if "smoke-caller" not in line
        ).strip()

    deadline = time.perf_counter() + 40
    while time.perf_counter() < deadline and not agent_reply():
        await asyncio.sleep(0.2)

    reply = agent_reply()
    replied_at = time.perf_counter()
    print("\ntranscript:")
    print("\n".join(transcript) if transcript else "  (none captured)")

    if not reply:
        print("\nFAIL: the agent never produced a reply")
        await room.disconnect()
        return 1

    # Approximate only. Authoritative per-stage numbers come from the agent's own
    # metrics (stage 5); this is an energy heuristic over the received audio.
    if first_audio_at:
        print(f"\napprox. time-to-first-audio: {(first_audio_at[0] - spoke_at) * 1000:.0f} ms")
    print(f"reply complete {replied_at - spoke_at:.1f}s after the question ended")

    ok = 0

    # The same frames the browser HUD renders. Checking them here proves the publish
    # path over the wire, and that the payload carries every field the HUD reads.
    if not metrics:
        print("\nFAIL: no metrics arrived on the data channel; the HUD would stay empty")
        await room.disconnect()
        return 1

    m = metrics[-1]
    print(f"\nmetrics over the data channel ({len(metrics)} frame(s)):")
    print(f"  ttfa {m.get('ttfa_estimate_ms')} ms = eou {m.get('eou_delay_ms')}"
          f" + llm {m.get('llm_ttft_ms')} + tts {m.get('tts_ttfb_ms')}")
    print(f"  served by {m.get('stt_provider')} / {m.get('llm_provider')}"
          f" / {m.get('tts_provider')}")
    missing = [
        k for k in ("ttfa_estimate_ms", "eou_delay_ms", "llm_ttft_ms", "tts_ttfb_ms",
                    "speech_id") if k not in m
    ]
    if missing:
        print(f"  FAIL: the HUD expects these fields and they are absent: {missing}")
        ok = 1

    # Audio arriving is not the same as the right answer arriving. For the default
    # question the knowledge base says 25 years, so the reply has to contain it.
    if question == DEFAULT_QUESTION:
        low = reply.lower()
        if "25" in low or "twenty-five" in low or "twenty five" in low:
            print("PASS: reply is grounded in the knowledge base (25-year warranty)")
        else:
            print("FAIL: agent replied, but not with the warranty period from the KB")
            ok = 1
    await room.disconnect()
    return ok


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("question", nargs="?", default=DEFAULT_QUESTION)
    sys.exit(asyncio.run(main(p.parse_args().question)))
