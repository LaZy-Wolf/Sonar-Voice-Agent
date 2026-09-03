"""Turn aggregation, using fake metric objects. No network, no LiveKit room."""

from __future__ import annotations

import json

import pytest
from livekit.agents import metrics as lk

from metrics_sink import MetricsSink, _provider


def eou(sid, delay=0.22, tx=0.31):
    return lk.EOUMetrics(
        timestamp=0.0, end_of_utterance_delay=delay, transcription_delay=tx,
        on_user_turn_completed_delay=0.0, speech_id=sid,
    )


def llm(sid, ttft=0.38, label="livekit.plugins.groq.services.LLM", cancelled=False):
    return lk.LLMMetrics(
        label=label, request_id="r", timestamp=0.0, duration=1.0, ttft=ttft,
        cancelled=cancelled, completion_tokens=42, prompt_tokens=100,
        prompt_cached_tokens=0, cache_creation_tokens=0, total_tokens=142,
        tokens_per_second=95.2, speech_id=sid,
    )


def tts(sid, ttfb=0.21, label="livekit.plugins.cartesia.tts.TTS", cancelled=False):
    return lk.TTSMetrics(
        label=label, request_id="r", timestamp=0.0, ttfb=ttfb, duration=1.0,
        audio_duration=2.4, cancelled=cancelled, characters_count=80,
        streamed=True, speech_id=sid, segment_id="s",
    )


def stt(label="livekit.plugins.deepgram.stt.STT"):
    return lk.STTMetrics(
        label=label, request_id="r", timestamp=0.0, duration=0.1, audio_duration=2.0,
        streamed=True,
    )


@pytest.fixture
def sink(tmp_path):
    return MetricsSink(room=None, jsonl_path=tmp_path / "turns.jsonl")


def test_a_turn_needs_all_three_stages(sink):
    assert sink.ingest(eou("a")) is None
    assert sink.ingest(llm("a")) is None
    rec = sink.ingest(tts("a"))
    assert rec is not None, "EOU + LLM + TTS should complete a turn"


def test_ttfa_is_the_sum_of_the_three_waits(sink):
    sink.ingest(eou("a", delay=0.20))
    sink.ingest(llm("a", ttft=0.40))
    rec = sink.ingest(tts("a", ttfb=0.15))
    assert rec["ttfa_estimate_ms"] == 750.0


def test_transcription_delay_is_recorded_but_not_summed(sink):
    """It overlaps end-of-utterance; adding it would double-count the same wait."""
    sink.ingest(eou("a", delay=0.20, tx=0.31))
    sink.ingest(llm("a", ttft=0.40))
    rec = sink.ingest(tts("a", ttfb=0.15))
    assert rec["transcription_delay_ms"] == 310.0
    assert rec["ttfa_estimate_ms"] == 750.0


def test_provider_is_attributed_from_the_plugin_label(sink):
    sink.ingest(stt())
    sink.ingest(eou("a"))
    sink.ingest(llm("a", label="livekit.plugins.openai.llm.LLM"))
    rec = sink.ingest(tts("a"))
    assert rec["llm_provider"] == "openai"      # NVIDIA is reached via the openai plugin
    assert rec["tts_provider"] == "cartesia"
    assert rec["stt_provider"] == "deepgram"


def test_interleaved_turns_do_not_mix(sink):
    """Two turns in flight must not borrow each other's numbers."""
    sink.ingest(eou("a", delay=0.10))
    sink.ingest(eou("b", delay=0.90))
    sink.ingest(llm("b", ttft=0.10))
    sink.ingest(llm("a", ttft=0.10))
    rec_b = sink.ingest(tts("b", ttfb=0.10))
    rec_a = sink.ingest(tts("a", ttfb=0.10))
    assert rec_b["ttfa_estimate_ms"] == 1100.0
    assert rec_a["ttfa_estimate_ms"] == 300.0


def test_interrupted_turn_is_dropped(sink):
    """An interruption cancels the turn; a half-measured turn would skew the p50."""
    sink.ingest(eou("a"))
    assert sink.ingest(llm("a", cancelled=True)) is None
    assert sink.ingest(tts("a")) is None
    assert sink.turns == []


def test_pending_turns_do_not_grow_without_bound(sink):
    for i in range(100):
        sink.ingest(eou(f"turn-{i}"))       # never completed
    assert len(sink._pending) <= 32


def test_each_turn_is_one_jsonl_line(sink, tmp_path):
    for sid in ("a", "b"):
        sink.ingest(eou(sid))
        sink.ingest(llm(sid))
        sink.ingest(tts(sid))
    lines = (tmp_path / "turns.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["speech_id"] == "a"


def test_unknown_label_does_not_crash():
    assert _provider(None) == "unknown"
    assert _provider("something.else") == "something.else"
