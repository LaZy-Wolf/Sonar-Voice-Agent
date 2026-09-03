"""Check every credential in .env against the live API it belongs to.

    python scripts/check_creds.py

Prints pass/fail per provider and never prints a key. Run it after pasting keys,
after a rotation, and before a demo — a free tier that quietly expired looks exactly
like a broken agent.
"""

from __future__ import annotations

import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

TTFT_SAMPLES = 5

OK, BAD, SKIP = "PASS", "FAIL", "skip"
results: list[tuple[str, str, str]] = []


def record(name: str, status: str, detail: str = "") -> None:
    results.append((name, status, detail))
    print(f"  {status:4}  {name:26} {detail}")


def env(key: str) -> str:
    return (os.getenv(key) or "").strip()


async def check_livekit() -> None:
    url, key, secret = env("LIVEKIT_URL"), env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET")
    if not (url and key and secret):
        return record("LiveKit", SKIP, "not set")
    try:
        from livekit import api

        lk = api.LiveKitAPI(url=url, api_key=key, api_secret=secret)
        rooms = await lk.room.list_rooms(api.ListRoomsRequest())
        await lk.aclose()
        record("LiveKit", OK, f"{url.split('//')[-1]}, {len(rooms.rooms)} rooms live")
    except Exception as e:
        record("LiveKit", BAD, f"{type(e).__name__}: {str(e)[:90]}")


async def check_deepgram(client: httpx.AsyncClient) -> None:
    key = env("DEEPGRAM_API_KEY")
    if not key:
        return record("Deepgram", SKIP, "not set")
    try:
        r = await client.get(
            "https://api.deepgram.com/v1/projects", headers={"Authorization": f"Token {key}"}
        )
        if r.status_code != 200:
            return record("Deepgram", BAD, f"HTTP {r.status_code}: {r.text[:80]}")
        projects = r.json().get("projects", [])
        record("Deepgram", OK, f"{len(projects)} project(s), model {env('DEEPGRAM_STT_MODEL')}")
    except Exception as e:
        record("Deepgram", BAD, f"{type(e).__name__}: {str(e)[:90]}")


async def check_nvidia(client: httpx.AsyncClient) -> None:
    """List models, confirm the configured one exists, then measure time-to-first-token.

    TTFT is the number that decides whether Nemotron can be the brain at all.
    """
    key, base, model = env("NVIDIA_API_KEY"), env("NVIDIA_BASE_URL"), env("NVIDIA_LLM_MODEL")
    if not key:
        return record("NVIDIA NIM", SKIP, "not set")
    headers = {"Authorization": f"Bearer {key}"}
    try:
        r = await client.get(f"{base}/models", headers=headers)
        if r.status_code != 200:
            return record("NVIDIA NIM", BAD, f"HTTP {r.status_code}: {r.text[:80]}")
        ids = [m["id"] for m in r.json().get("data", [])]
        nemotrons = [m for m in ids if "nemotron" in m.lower()]
        if model in ids:
            record("NVIDIA NIM", OK, f"{len(ids)} models, {model} available")
        else:
            record("NVIDIA NIM", BAD, f"{model} NOT in the {len(ids)} listed models")
            print(f"        nemotron models offered: {', '.join(nemotrons[:6]) or 'none'}")
            return
    except Exception as e:
        return record("NVIDIA NIM", BAD, f"{type(e).__name__}: {str(e)[:90]}")

    # Only the configured mode is a pass/fail gate. The other is measured for the record,
    # because "which mode and why" is a question this project has to answer with numbers.
    thinking_off = env("NVIDIA_DISABLE_THINKING") not in ("0", "false", "")
    for label, body_extra, gated in (
        ("thinking off", {"chat_template_kwargs": {"thinking": False}}, thinking_off),
        ("thinking on", {}, not thinking_off),
    ):
        # NIM's free tier is very variable — single samples have ranged from 287 ms to
        # 3.5 s for the same call. Take a median, and show the spread.
        runs, fails = [], 0
        for _ in range(TTFT_SAMPLES):
            try:
                runs.append(await _ttft(client, base, headers, model, body_extra))
            except Exception:
                fails += 1
        if not runs:
            record(f"  TTFT {label}", BAD if gated else SKIP, f"all {TTFT_SAMPLES} attempts failed")
            continue

        med = statistics.median(runs)
        spread = f"{med * 1000:.0f} ms median of {len(runs)} (spread {min(runs) * 1000:.0f}-" \
                 f"{max(runs) * 1000:.0f} ms{f', {fails} failed' if fails else ''})"
        if gated:
            record(f"  TTFT {label}", OK if med < 0.8 else BAD, spread)
        else:
            print(f"  info  {'TTFT ' + label:26} {spread} (not in use)")


async def _ttft(client, base, headers, model, extra) -> float:
    """Seconds until the first content token arrives on a streamed completion."""
    body = {
        "model": model,
        "messages": [{"role": "user", "content": "Say hello in four words."}],
        "stream": True,
        "max_tokens": 32,
        **extra,
    }
    start = time.perf_counter()
    async with client.stream("POST", f"{base}/chat/completions", headers=headers, json=body) as r:
        r.raise_for_status()
        async for line in r.aiter_lines():
            if not line.startswith("data: ") or line.endswith("[DONE]"):
                continue


            delta = json.loads(line[6:])["choices"][0].get("delta", {})
            if delta.get("content"):
                return time.perf_counter() - start
    raise RuntimeError("stream produced no content")


async def check_cartesia(client: httpx.AsyncClient) -> None:
    key, voice = env("CARTESIA_API_KEY"), env("CARTESIA_VOICE")
    if not key:
        return record("Cartesia", SKIP, "not set")
    headers = {"X-API-Key": key, "Cartesia-Version": "2024-06-10"}
    try:
        r = await client.get("https://api.cartesia.ai/voices", headers=headers)
        if r.status_code != 200:
            return record("Cartesia", BAD, f"HTTP {r.status_code}: {r.text[:80]}")
        data = r.json()
        voices = data if isinstance(data, list) else data.get("data", [])
        record("Cartesia", OK, f"{len(voices)} voices, model {env('CARTESIA_MODEL')}")

        ids = {v.get("id") for v in voices}
        if not voice:
            record("  CARTESIA_VOICE", OK, "empty — plugin default will be used")
        elif voice in ids:
            record("  CARTESIA_VOICE", OK, "valid voice id")
        else:
            record("  CARTESIA_VOICE", BAD, f"{voice!r} is not a voice id")
            for v in voices[:4]:
                print(f"        {v.get('id')}  {v.get('name')}")
    except Exception as e:
        record("Cartesia", BAD, f"{type(e).__name__}: {str(e)[:90]}")


async def check_voice_roundtrip(client: httpx.AsyncClient) -> None:
    """Speak a phrase with Cartesia, then transcribe it with Deepgram.

    A valid key is not the same as a working path. This exercises both services the
    way the agent actually uses them, and fails loudly if either is misconfigured.
    """
    ck, dk = env("CARTESIA_API_KEY"), env("DEEPGRAM_API_KEY")
    if not (ck and dk):
        return record("Voice round-trip", SKIP, "needs both Cartesia and Deepgram")

    phrase = "The panel warranty is twenty five years."
    try:
        body = {
            "model_id": env("CARTESIA_MODEL") or "sonic-3",
            "transcript": phrase,
            "voice": {"mode": "id", "id": env("CARTESIA_VOICE")},
            "output_format": {"container": "wav", "encoding": "pcm_s16le", "sample_rate": 24000},
            "language": "en",
        }
        r = await client.post(
            "https://api.cartesia.ai/tts/bytes",
            headers={"X-API-Key": ck, "Cartesia-Version": "2024-06-10"},
            json=body,
        )
        if r.status_code != 200:
            return record("Cartesia synthesis", BAD, f"HTTP {r.status_code}: {r.text[:80]}")
        audio = r.content
        record("Cartesia synthesis", OK, f"{len(audio) / 1024:.0f} KB of wav returned")
    except Exception as e:
        return record("Cartesia synthesis", BAD, f"{type(e).__name__}: {str(e)[:90]}")

    try:
        # A dedicated client: on the shared one — already used for streaming — Deepgram
        # closes the connection without any response. Content-Length alone did not fix it.
        async with httpx.AsyncClient(timeout=60) as fresh:
            r = await fresh.post(
                "https://api.deepgram.com/v1/listen",
                params={
                    "model": env("DEEPGRAM_STT_MODEL") or "nova-3",
                    "language": "en-US",
                    "smart_format": "true",
                },
                headers={
                    "Authorization": f"Token {dk}",
                    "Content-Type": "audio/wav",
                    "Content-Length": str(len(audio)),
                },
                content=audio,
            )
        if r.status_code != 200:
            return record("Deepgram transcription", BAD, f"HTTP {r.status_code}: {r.text[:80]}")
        alt = r.json()["results"]["channels"][0]["alternatives"][0]
        heard = alt["transcript"]
        got_it = "warranty" in heard.lower() and ("25" in heard or "twenty five" in heard.lower())
        record(
            "Deepgram transcription",
            OK if got_it else BAD,
            f"heard {heard!r}" + ("" if got_it else "  <- did not match what was spoken"),
        )
    except Exception as e:
        record("Deepgram transcription", BAD, f"{type(e).__name__}: {str(e)[:90]}")


async def check_groq(client: httpx.AsyncClient) -> None:
    key, model = env("GROQ_API_KEY"), env("GROQ_LLM_MODEL")
    if not key:
        return record("Groq", SKIP, "not set — LLM fallback disabled")
    try:
        r = await client.get(
            "https://api.groq.com/openai/v1/models", headers={"Authorization": f"Bearer {key}"}
        )
        if r.status_code != 200:
            return record("Groq", BAD, f"HTTP {r.status_code}: {r.text[:80]}")
        ids = [m["id"] for m in r.json().get("data", [])]
        if model in ids:
            record("Groq", OK, f"{len(ids)} models, {model} available")
        else:
            record("Groq", BAD, f"{model} not listed")
            print(f"        llama models: {', '.join(m for m in ids if 'llama' in m)[:150]}")
    except Exception as e:
        record("Groq", BAD, f"{type(e).__name__}: {str(e)[:90]}")


async def check_twilio(client: httpx.AsyncClient) -> None:
    sid, token = env("TWILIO_ACCOUNT_SID"), env("TWILIO_AUTH_TOKEN")
    if not (sid and token):
        return record("Twilio", SKIP, "not set")
    try:
        r = await client.get(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json", auth=(sid, token)
        )
        if r.status_code != 200:
            return record("Twilio", BAD, f"HTTP {r.status_code}: {r.text[:80]}")
        acct = r.json()
        record("Twilio", OK, f"{acct.get('friendly_name')} — status {acct.get('status')}, "
                             f"type {acct.get('type')}")

        n = await client.get(
            f"https://api.twilio.com/2010-04-01/Accounts/{sid}/IncomingPhoneNumbers.json",
            auth=(sid, token),
        )
        owned = [p["phone_number"] for p in n.json().get("incoming_phone_numbers", [])]
        configured = env("TWILIO_PHONE_NUMBER").replace(" ", "")
        if not owned:
            record("  phone number", BAD, "account owns no numbers — buy one in the console")
        elif configured in owned:
            record("  phone number", OK, f"{configured} owned by this account")
        else:
            record("  phone number", BAD, f"{configured or '(unset)'} not owned; owns {owned}")
    except Exception as e:
        record("Twilio", BAD, f"{type(e).__name__}: {str(e)[:90]}")


def check_formats() -> None:
    """Things that are wrong on their face, before any network call."""
    num = env("TWILIO_PHONE_NUMBER")
    if num and (" " in num or not num.startswith("+")):
        record("  number format", BAD, f"{num!r} — must be E.164, e.g. +12344007106")

    uri = env("TWILIO_SIP_TERMINATION_URI")
    if uri and (" " in uri or not uri.endswith(".pstn.twilio.com")):
        record("  termination URI", BAD, f"{uri!r} — must be <name>.pstn.twilio.com, no spaces")


async def main() -> int:
    print("\nChecking credentials from .env\n")
    async with httpx.AsyncClient(timeout=45) as client:
        await check_livekit()
        await check_deepgram(client)
        await check_nvidia(client)
        await check_cartesia(client)
        await check_voice_roundtrip(client)
        await check_groq(client)
        await check_twilio(client)
        check_formats()

    failed = [n for n, s, _ in results if s == BAD]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("failing: " + ", ".join(n.strip() for n in failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
