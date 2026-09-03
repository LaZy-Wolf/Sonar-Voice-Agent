# SONAR

A real-time, interruptible voice agent that answers the phone. It is the front desk for
Helios Solar, a fictional rooftop installer: it looks customers up, answers questions
from a knowledge base, checks a calendar and books site visits. You can reach it from a
web page or by dialling a phone number, and it can ring you.

Every turn is timed stage by stage, so the latency table below is measured rather than
claimed.

```
Browser (Next.js) ──WebRTC──┐
                             ├─► LiveKit room ◄──► agent worker
PSTN ──► Twilio SIP trunk ───┘                      │
                                                    ├─► Deepgram nova-3   (speech to text, streaming)
                                                    ├─► Groq qwen3.8-27b  (with NVIDIA Nemotron behind it)
                                                    ├─► Cartesia Sonic    (text to speech)
                                                    └─► MCP server ──► SQLite
```

Telephony does not fork the agent. LiveKit bridges a phone call into a room as an
ordinary participant, so one worker serves the browser, inbound calls and outbound calls
without knowing the difference. The only thing that changes is the opening line.

## Measured latency

Six turns, browser path, agent running in India against US-hosted providers.
Regenerate with `make report-md`; the full table is in
[`docs/latency-budget.md`](docs/latency-budget.md).

| Stage | p50 | p95 | target | met |
|---|---:|---:|---:|:--:|
| End-of-utterance detection | 634 ms | 646 ms | 350 ms | no |
| Transcription | 508 ms | 537 ms | 150 ms | no |
| LLM first token | 492 ms | 721 ms | 500 ms | yes |
| TTS first byte | 129 ms | 195 ms | 150 ms | yes |
| **Time to first audio** | **1299 ms** | **1473 ms** | 900 ms | no |

The model stages hit their targets. Hearing the caller does not, and the reason is
geography rather than configuration. Round-trip from the machine running the agent:

| Provider | median RTT |
|---|---:|
| NVIDIA NIM | 106 ms |
| Groq | 423 ms |
| Deepgram | 1115 ms |
| Cartesia | 1853 ms |

Deepgram and Cartesia have no region near India. End-of-utterance cannot resolve until
the final transcript arrives, so it trails transcription by about 180 ms and inherits
that distance. Halving `min_endpointing_delay` from 400 ms to 200 ms moved
end-of-utterance by 10 ms, which is how the constraint was identified: it was never the
delay. Running the worker next to the providers would close most of the gap, which is a
deployment choice rather than a code change.

## Design decisions

**Groq leads the model chain, and Nemotron was demoted on evidence.** Nemotron was the
intended brain and its tool calling is faultless. But NVIDIA NIM's free tier measured a
median time-to-first-token of 597 ms against a worst case of 5203 ms, and it timed out
repeatedly on the second call of a turn, the one carrying a tool result back to the
model. In one live call that cost 5.6 seconds of silence. Groq's `qwen3.8-27b` measured
355 ms median, 456 ms worst, with no failures across every run. On a phone call the p95
is what people hang up on, so Groq leads and Nemotron covers Groq's rate limits.

**The fallback chain is load-bearing, not decorative.** It has fired during real calls
and rescued turns. `attempt_timeout` is 2.5 s rather than the 5 s default, because five
seconds of dead air is not a fallback.

**Tools go through MCP.** Six functions over SQLite, exposed by a FastMCP server. The
functions in `sonar_tools/tools.py` import nothing from MCP, so they are testable on
their own, and their docstrings are written as the tool descriptions the model reads.
None of them raise for user error: they return `{"ok": false, "reason": ...}` so the
agent can recover in conversation instead of dropping the call.

**Trunk configuration is code.** `scripts/setup_sip.py` builds the LiveKit trunks, the
dispatch rule and the Twilio origination URI, idempotently, so the wiring can be
reviewed and rebuilt rather than remembered.

**Inbound calls get one room each.** A direct dispatch rule would put two simultaneous
callers into the same conversation.

## What is verified, and how

- `scripts/check_creds.py` checks all six providers against their live APIs and does a
  real voice round-trip: Cartesia synthesises a phrase, Deepgram transcribes it back.
- `scripts/smoke_call.py` joins a room, speaks a synthesised question, and asserts the
  reply is grounded in the knowledge base. It fails on a wrong answer, not merely on a
  dead process. It also subscribes to the metrics topic and checks every field the
  browser latency panel reads.
- 46 unit tests over the tools, the settings and the metrics aggregation.

```bash
make test
```

## Running locally

```bash
cp .env.example .env     # then fill in the keys
make setup
make check               # verify every credential against its live API
```

Then, in separate terminals:

```bash
make mcp
make agent
make web
```

For telephony, once the Twilio values are set:

```bash
make sip
```

## Costs

Everything except telephony runs on a free tier. Twilio is not free: a number is about
$1.15 a month and calls run about $0.014 a minute. A trial account only accepts inbound
calls from numbers verified in its console, and can only dial those same numbers.

## Layout

```
agent/         the worker: config, prompts, metrics sink
mcp-server/    six tools over SQLite, served over streamable HTTP
web/           Next.js call page with a live latency panel
scripts/       credential checks, the smoke call, SIP setup, the latency report
docs/          the design spec, the decisions log, the latency budget
```

[`docs/decisions-log.md`](docs/decisions-log.md) records what changed during the build
and why, including the measurements that reversed the model choice and the two
hypotheses that turned out to be wrong.

## Licence

MIT
