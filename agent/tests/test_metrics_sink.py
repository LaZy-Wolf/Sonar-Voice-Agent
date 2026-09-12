"""Turn aggregation, using fake metric objects. No network, no LiveKit room."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from livekit.agents import metrics as lk
from livekit.agents.metrics.base import Metadata

from metrics_sink import MetricsSink, _provider


def eou(sid, delay=0.22, tx=0.31):
    return lk.EOUMetrics(
        timestamp=0.0, end_of_utterance_delay=delay, transcription_delay=tx,
        on_user_turn_completed_delay=0.0, speech_id=sid,
    )


def llm(sid, ttft=0.38, label="livekit.plugins.groq.services.LLM", cancelled=False, host=None):
    return lk.LLMMetrics(
        label=label, request_id="r", timestamp=0.0, duration=1.0, ttft=ttft,
        cancelled=cancelled, completion_tokens=42, prompt_tokens=100,
        prompt_cached_tokens=0, cache_creation_tokens=0, total_tokens=142,
        tokens_per_second=95.2, speech_id=sid,
        metadata=Metadata(model_provider=host) if host else None,
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


def reply(e2e=1.2, role="assistant"):
    """A spoken reply as LiveKit adds it to the conversation."""
    return SimpleNamespace(role=role, metrics={} if e2e is None else {"e2e_latency": e2e})


@pytest.fixture
def sink(tmp_path):
    return MetricsSink(room=None, jsonl_path=tmp_path / "turns.jsonl")


def test_a_turn_completes_when_its_reply_is_spoken(sink):
    assert sink.ingest(eou("a")) is None
    assert sink.ingest(llm("a")) is None
    assert sink.ingest(tts("a")) is None, "stages alone cannot say how long the caller waited"
    assert sink.ingest_reply(reply()) is not None


def test_ttfa_is_measured_not_summed(sink):
    """A tool turn makes two model calls, and the tool round sits outside every stage.
    Summing the stages called this turn 750 ms; the caller waited 1.9 s."""
    sink.ingest(eou("a", delay=0.20))
    sink.ingest(llm("a", ttft=0.50))    # decides to call a tool
    sink.ingest(llm("a", ttft=0.40))    # answers from what the tool returned
    sink.ingest(tts("a", ttfb=0.15))
    rec = sink.ingest_reply(reply(e2e=1.9))
    assert rec["ttfa_ms"] == 1900.0
    assert rec["llm_calls"] == 2
    assert rec["llm_ttft_ms"] == 400.0, "the answer's first token is the one that feeds speech"


def test_reply_can_arrive_before_the_tts_metric(sink):
    sink.ingest(eou("a"))
    sink.ingest(llm("a"))
    assert sink.ingest_reply(reply(e2e=1.1)) is None
    assert sink.ingest(tts("a"))["ttfa_ms"] == 1100.0


def test_the_greeting_is_not_a_turn(sink):
    """Nobody spoke before the greeting, so LiveKit gives it no end-to-end timing."""
    sink.ingest(tts("greeting"))
    assert sink.ingest_reply(reply(e2e=None)) is None
    assert sink.ingest_reply(reply(role="user")) is None
    assert sink.turns == []


def test_transcription_delay_is_recorded(sink):
    sink.ingest(eou("a", tx=0.31))
    sink.ingest(llm("a"))
    sink.ingest(tts("a"))
    assert sink.ingest_reply(reply())["transcription_delay_ms"] == 310.0


def test_provider_is_attributed_from_the_plugin_label(sink):
    sink.ingest(stt())
    sink.ingest(eou("a"))
    sink.ingest(llm("a"))
    sink.ingest(tts("a"))
    rec = sink.ingest_reply(reply())
    assert rec["llm_provider"] == "groq"
    assert rec["tts_provider"] == "cartesia"
    assert rec["stt_provider"] == "deepgram"


def test_openai_compatible_endpoints_are_told_apart(sink):
    """OpenRouter and NVIDIA both come through the openai plugin; the host separates them."""
    sink.ingest(eou("a"))
    sink.ingest(llm("a", label="livekit.plugins.openai.llm.LLM", host="openrouter.ai"))
    sink.ingest(tts("a"))
    assert sink.ingest_reply(reply())["llm_provider"] == "openrouter.ai"


def test_interleaved_stages_do_not_mix(sink):
    """Stage metrics from two turns in flight must not borrow each other's numbers."""
    sink.ingest(eou("a", delay=0.10))
    sink.ingest(eou("b", delay=0.90))
    sink.ingest(llm("b", ttft=0.20))
    sink.ingest(llm("a", ttft=0.30))
    sink.ingest(tts("b"))
    sink.ingest(tts("a"))
    rec_b = sink.ingest_reply(reply())      # the turn that ended last is answered first
    rec_a = sink.ingest_reply(reply())
    assert (rec_b["eou_delay_ms"], rec_b["llm_ttft_ms"]) == (900.0, 200.0)
    assert (rec_a["eou_delay_ms"], rec_a["llm_ttft_ms"]) == (100.0, 300.0)


def test_interrupted_turn_is_dropped(sink):
    """An interruption cancels the turn; a half-measured turn would skew the p50."""
    sink.ingest(eou("a"))
    assert sink.ingest(llm("a", cancelled=True)) is None
    assert sink.ingest(tts("a")) is None
    assert sink.ingest_reply(reply()) is None
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
        sink.ingest_reply(reply())
    lines = (tmp_path / "turns.jsonl").read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["speech_id"] == "a"


def test_unknown_label_does_not_crash():
    assert _provider(None) == "unknown"
    assert _provider("something.else") == "something.else"
