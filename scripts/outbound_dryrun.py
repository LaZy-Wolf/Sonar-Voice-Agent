"""Exercise the outbound code path without dialling a phone.

    python scripts/outbound_dryrun.py

Creates a room carrying outbound metadata and joins it, so the agent runs its outbound
branch: building the brief, starting the session, then waiting for an answer. No SIP
participant ever appears, so the agent should sit in the answer gate and never speak.

This exists because an outbound-only bug reached a live call twice: once greeting a
ringing line, once crashing on a read-only chat context. Both were in code the browser
tests never touched, and each cost a real phone call to discover.

Exit code 0 means the branch ran and the agent correctly stayed silent.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from livekit import api, rtc

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

WATCH_SECONDS = 20


def env(key: str) -> str:
    return (os.getenv(key) or "").strip()


async def main() -> int:
    room_name = f"sonar-out-dryrun-{int(time.time())}"
    lk = api.LiveKitAPI(
        url=env("LIVEKIT_URL"),
        api_key=env("LIVEKIT_API_KEY"),
        api_secret=env("LIVEKIT_API_SECRET"),
    )
    await lk.room.create_room(
        api.CreateRoomRequest(
            name=room_name,
            metadata=json.dumps(
                {"phone_number": "+910000000000", "reason": "a dry run of the outbound path"}
            ),
        )
    )
    await lk.aclose()
    print(f"room with outbound metadata: {room_name}")

    token = (
        api.AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"))
        .with_identity("dryrun-callee")
        .with_grants(
            api.VideoGrants(room_join=True, room=room_name, can_publish=True, can_subscribe=True)
        )
        .to_jwt()
    )

    room = rtc.Room()
    spoke: list[str] = []

    @room.on("transcription_received")
    def _tx(segments, participant=None, publication=None):
        for s in segments:
            if s.final:
                spoke.append(s.text)

    await room.connect(env("LIVEKIT_URL"), token)

    for _ in range(200):
        if room.remote_participants:
            break
        await asyncio.sleep(0.1)

    if not room.remote_participants:
        print("FAIL: the agent never joined. Is the worker running?")
        await room.disconnect()
        return 1
    print(f"agent joined: {list(room.remote_participants)}")

    # If the outbound branch crashes, the agent disconnects instead of waiting.
    print(f"watching for {WATCH_SECONDS}s: the agent should stay and stay silent...")
    for _ in range(WATCH_SECONDS * 10):
        if not room.remote_participants:
            print("FAIL: the agent left the room, which means its job crashed")
            await room.disconnect()
            return 1
        if spoke:
            print(f"FAIL: the agent spoke to an unanswered line: {spoke!r}")
            await room.disconnect()
            return 1
        await asyncio.sleep(0.1)

    print("PASS: outbound branch ran, agent waited in the answer gate and said nothing")
    await room.disconnect()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
