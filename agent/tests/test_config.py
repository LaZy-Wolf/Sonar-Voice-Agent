"""Provider construction. No network — these only check what gets built."""

from __future__ import annotations

import pytest
from livekit.agents import llm as _llm
from livekit.plugins import cartesia, deepgram

import config as cfg


@pytest.fixture
def settings(monkeypatch):
    """A settings object with plausible values, isolated from the real .env."""
    for k, v in {
        "deepgram_api_key": "dg-test",
        "nvidia_api_key": "nv-test",
        "cartesia_api_key": "ct-test",
        "groq_api_key": "",
        "cartesia_voice": "",
    }.items():
        monkeypatch.setattr(cfg.settings, k, v)
    return cfg.settings


def test_stt_is_deepgram_streaming(settings):
    built = cfg.build_stt()
    assert isinstance(built, deepgram.STT)
    assert built.capabilities.streaming, "streaming STT is the whole reason Deepgram is here"


def test_tts_is_cartesia(settings):
    assert isinstance(cfg.build_tts(), cartesia.TTS)


def test_single_llm_without_a_groq_key(settings):
    """No fallback key means no adapter — one provider, not a chain of one."""
    assert not isinstance(cfg.build_llm(), _llm.FallbackAdapter)


def test_groq_key_adds_a_fallback(settings, monkeypatch):
    monkeypatch.setattr(cfg.settings, "groq_api_key", "gq-test")
    assert isinstance(cfg.build_llm(), _llm.FallbackAdapter)


def test_thinking_disabled_by_default(settings):
    """Nemotron reasoning must be off: it costs seconds of time-to-first-token."""
    assert cfg.settings.nvidia_disable_thinking is True


def test_settings_load_without_an_env_file():
    """Every field has a default, so importing config never explodes on a fresh clone."""
    assert cfg.Settings().nvidia_base_url.startswith("https://")


def test_mcp_url_avoids_the_docker_port():
    """8000 is taken by Docker Desktop on the dev machine; see the decisions log."""
    assert ":8000" not in cfg.settings.mcp_server_url
