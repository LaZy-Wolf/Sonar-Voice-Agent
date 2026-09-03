"""Per-turn latency records.

LiveKit emits one metrics object per stage as it completes, each tagged with the
`speech_id` of the turn it belongs to. This collects them into a single record per
turn, appends it to JSONL for the latency report, and publishes the same record on the
room data channel so the browser can draw a live HUD.

The published latency table comes from here, so the arithmetic is deliberately plain.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
from pathlib import Path
from typing import Any

from livekit import rtc
from livekit.agents import metrics as lk

log = logging.getLogger("sonar.metrics")

DATA_TOPIC = "sonar.metrics"
# A turn whose stages never all arrive (interrupted, cancelled, errored) would otherwise
# sit in the pending map forever. Long calls are many turns; keep the map small.
MAX_PENDING = 32


def _provider(label: str | None) -> str:
    """'livekit.plugins.groq.services.LLM' -> 'groq'.

    The plan expected provider attribution to be awkward. It is not: every metric
    carries the plugin label, so which chain member served a turn is already known.
    """
    if not label:
        return "unknown"
    parts = label.split(".")
    return parts[2] if len(parts) > 2 and parts[0] == "livekit" else label


def _ms(seconds: float | None) -> float | None:
    return None if seconds is None else round(seconds * 1000, 1)


class MetricsSink:
    """Accumulates stage metrics into one record per turn."""

    def __init__(self, room: rtc.Room | None, jsonl_path: str | Path) -> None:
        self._room = room
        self._path = Path(jsonl_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._pending: dict[str, dict[str, Any]] = {}
        # STT metrics carry no speech_id, so the most recent one is attributed to the
        # next turn that completes. Approximate, and labelled as such in the record.
        self._last_stt: dict[str, Any] | None = None
        self.turns: list[dict[str, Any]] = []

    # ── ingest ──────────────────────────────────────────────────────────────

    def ingest(self, m: Any) -> dict[str, Any] | None:
        """Take one metrics object. Returns the turn record if this completed a turn."""
        if isinstance(m, lk.STTMetrics):
            self._last_stt = {
                "stt_provider": _provider(m.label),
                "stt_duration_ms": _ms(m.duration),
                "stt_streamed": m.streamed,
            }
            return None

        if isinstance(m, lk.EOUMetrics):
            self._slot(m.speech_id).update(
                eou_delay_ms=_ms(m.end_of_utterance_delay),
                transcription_delay_ms=_ms(m.transcription_delay),
            )
        elif isinstance(m, lk.LLMMetrics):
            if m.cancelled:
                self._pending.pop(m.speech_id, None)
                return None
            self._slot(m.speech_id).update(
                llm_provider=_provider(m.label),
                llm_ttft_ms=_ms(m.ttft),
                llm_completion_tokens=m.completion_tokens,
                llm_tokens_per_s=round(m.tokens_per_second, 1) if m.tokens_per_second else None,
            )
        elif isinstance(m, lk.TTSMetrics):
            if m.cancelled:
                self._pending.pop(m.speech_id, None)
                return None
            self._slot(m.speech_id).update(
                tts_provider=_provider(m.label),
                tts_ttfb_ms=_ms(m.ttfb),
                tts_audio_duration_ms=_ms(m.audio_duration),
            )
        else:
            return None

        return self._flush_if_complete(m.speech_id)

    def _slot(self, speech_id: str) -> dict[str, Any]:
        if speech_id not in self._pending:
            if len(self._pending) >= MAX_PENDING:
                # Drop the oldest incomplete turn rather than grow without bound.
                self._pending.pop(next(iter(self._pending)))
            self._pending[speech_id] = {"speech_id": speech_id, "ts": time.time()}
        return self._pending[speech_id]

    def _flush_if_complete(self, speech_id: str) -> dict[str, Any] | None:
        """A turn is complete once we know when it ended, how fast it thought, and how
        fast it started speaking. Anything less cannot produce a time-to-first-audio."""
        rec = self._pending.get(speech_id)
        if not rec or not all(k in rec for k in ("eou_delay_ms", "llm_ttft_ms", "tts_ttfb_ms")):
            return None

        del self._pending[speech_id]
        if self._last_stt:
            rec.update(self._last_stt)

        # What the caller actually waits through: silence detected, model thinks, first
        # audio leaves. Transcription overlaps end-of-utterance in LiveKit's pipeline, so
        # adding it here would double-count; it is recorded separately instead.
        rec["ttfa_estimate_ms"] = round(
            rec["eou_delay_ms"] + rec["llm_ttft_ms"] + rec["tts_ttfb_ms"], 1
        )

        self.turns.append(rec)
        self._write(rec)
        self._publish(rec)
        log.info(
            "turn %s: ttfa %.0fms (eou %.0f + llm %.0f + tts %.0f) via %s",
            speech_id[:8], rec["ttfa_estimate_ms"], rec["eou_delay_ms"],
            rec["llm_ttft_ms"], rec["tts_ttfb_ms"], rec.get("llm_provider", "?"),
        )
        return rec

    # ── outputs ─────────────────────────────────────────────────────────────

    def _write(self, rec: dict[str, Any]) -> None:
        with self._path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")

    def _publish(self, rec: dict[str, Any]) -> None:
        """Push to the browser HUD. Never let telemetry break a live call."""
        if self._room is None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return

        async def send() -> None:
            with contextlib.suppress(Exception):
                await self._room.local_participant.publish_data(
                    json.dumps(rec).encode(), reliable=True, topic=DATA_TOPIC
                )

        loop.create_task(send())
