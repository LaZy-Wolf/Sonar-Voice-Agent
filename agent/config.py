"""Settings and provider construction.

The provider chain is built here and nowhere else, so swapping a vendor is a change
to one file. Signatures were checked against the installed plugins (livekit-agents
1.7.1), not against documentation.
"""

from __future__ import annotations

from pathlib import Path

from livekit.agents import llm as _llm
from livekit.plugins import cartesia, deepgram, groq, openai
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Everything from the repo-root .env. Absolute path, so cwd does not matter."""

    model_config = SettingsConfigDict(
        env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    livekit_url: str = ""
    livekit_api_key: str = ""
    livekit_api_secret: str = ""

    deepgram_api_key: str = ""
    deepgram_stt_model: str = "nova-3"

    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_llm_model: str = "nvidia/nemotron-3-super-120b-a12b"
    # Nemotron reasons before answering, which costs seconds of time-to-first-token —
    # unusable in a voice turn. Off by default; stage 3 measures both ways.
    nvidia_disable_thinking: bool = True

    cartesia_api_key: str = ""
    cartesia_model: str = "sonic-3"
    cartesia_voice: str = ""

    groq_api_key: str = ""
    # gpt-oss calls tools silently and answers from what they return. qwen3.8-27b, the
    # previous choice, announced "let me check" without calling a tool at temperature 0.3,
    # and spoke a preamble first at its default. Measured; see docs/decisions-log.md.
    groq_llm_model: str = "openai/gpt-oss-20b"
    # gpt-oss reasons before answering. "low" kept it to 7-19 tokens per request in testing,
    # and every reasoning token costs latency and counts against the output cap. Set this
    # empty for a Groq model that does not accept reasoning_effort.
    groq_reasoning_effort: str = "low"

    # Empty spawns the tool server over stdio, which is what the deployed image does.
    mcp_server_url: str = ""
    metrics_jsonl: str = "./data/turns.jsonl"
    log_level: str = "INFO"
    worker_http_port: int = 8081

    # Caps every LLM reply. Voice replies are two sentences, so this is a backstop, and it is
    # also a rate-limit budget: Groq's free tier allows 1,000 output tokens per minute and
    # reserves each request's full cap up front. Uncapped, one request asked for 1,237 and
    # was refused outright; at 400, two requests per turn still starved the minute.
    max_reply_tokens: int = 200
    # Seconds a provider gets to produce its first token before the chain moves on.
    llm_attempt_timeout: float = 2.5
    # Floor on how long to wait after speech stops before deciding the turn is over.
    # It lands in time-to-first-audio one-for-one, so it is the cheapest latency knob —
    # and the riskiest: too low and the agent talks over people who were mid-thought.
    min_endpointing_delay: float = 0.4


settings = Settings()


def build_stt() -> deepgram.STT:
    """Deepgram streaming STT. No fallback: the only offline option is an order of
    magnitude slower, which would defeat the point of measuring latency at all."""
    return deepgram.STT(
        model=settings.deepgram_stt_model,
        language="en-US",
        api_key=settings.deepgram_api_key,
        interim_results=True,
    )


def _nemotron() -> openai.LLM:
    """Nemotron through NVIDIA NIM's OpenAI-compatible endpoint."""
    extra_body = {}
    if settings.nvidia_disable_thinking:
        # Reasoning costs seconds of time-to-first-token: ~600 ms off versus 0.9-4.4 s on.
        # Tool calling works either way.
        extra_body["chat_template_kwargs"] = {"thinking": False}
    return openai.LLM(
        model=settings.nvidia_llm_model,
        base_url=settings.nvidia_base_url,
        api_key=settings.nvidia_api_key,
        temperature=0.3,
        max_completion_tokens=settings.max_reply_tokens,
        extra_body=extra_body or openai.NOT_GIVEN,
    )


def build_llm() -> _llm.LLM:
    """Groq first, Nemotron behind it.

    This ordering is the result of measurement, not preference. Nemotron was the intended
    brain and its tool calling is faultless, but NVIDIA NIM's free tier has a median
    time-to-first-token around 600 ms and a worst case over 5 s, and it timed out
    repeatedly on the follow-up call that carries a tool result back to the model. Groq
    measured 355 ms median, 456 ms worst, with no failures across every test run. On a
    phone call the tail is what the caller hears, so Groq leads and Nemotron covers Groq's
    rate limits. See docs/decisions-log.md for the numbers.
    """
    chain = []
    if settings.groq_api_key:
        chain.append(
            groq.LLM(
                model=settings.groq_llm_model,
                api_key=settings.groq_api_key,
                temperature=0.3,
                max_completion_tokens=settings.max_reply_tokens,
                reasoning_effort=settings.groq_reasoning_effort or openai.NOT_GIVEN,
            )
        )
    if settings.nvidia_api_key:
        chain.append(_nemotron())
    if not chain:
        raise RuntimeError("No LLM configured: set GROQ_API_KEY or NVIDIA_API_KEY in .env")
    if len(chain) == 1:
        return chain[0]

    # attempt_timeout defaults to 5s, which is five seconds of silence on a phone call
    # before the fallback is even considered. max_retry_per_llm is left at its default
    # of 0 (no in-turn retry), which is already the right behaviour for voice.
    return _llm.FallbackAdapter(llm=chain, attempt_timeout=settings.llm_attempt_timeout)


def build_tts() -> cartesia.TTS:
    """Cartesia Sonic. An empty CARTESIA_VOICE keeps the plugin's default voice."""
    kwargs = {"voice": settings.cartesia_voice} if settings.cartesia_voice else {}
    return cartesia.TTS(model=settings.cartesia_model, api_key=settings.cartesia_api_key, **kwargs)
