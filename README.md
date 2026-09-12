# SONAR

[![ci](https://github.com/LaZy-Wolf/Sonar-Voice-Agent/actions/workflows/ci.yml/badge.svg)](https://github.com/LaZy-Wolf/Sonar-Voice-Agent/actions/workflows/ci.yml)

**Live demo: [sonar-voice-agent.vercel.app](https://sonar-voice-agent.vercel.app).** Click
*Start talking* and your browser asks for the microphone. The agent runs on LiveKit Cloud's
free plan, which shuts an idle agent down, so the first visitor after a quiet spell waits
10 to 20 seconds for it to join.

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
                                                    ├─► Groq gpt-oss-20b   (then OpenRouter, then NVIDIA Nemotron)
                                                    ├─► Cartesia Sonic    (text to speech)
                                                    └─► MCP server ──► SQLite
```

Telephony does not fork the agent. LiveKit bridges a phone call into a room as an
ordinary participant, so one worker serves the browser, inbound calls and outbound calls
without knowing the difference. The only thing that changes is the opening line.

## Measured latency

Five turns against the deployed agent in `us-east`, three of them answered through a tool
call. Time to first audio is LiveKit's own end-to-end figure: from the caller going quiet to
the agent's first audio frame, the tool round included. The frames are in
[`docs/measurements/us-east-2026-09-11.jsonl`](docs/measurements/us-east-2026-09-11.jsonl),
and `make report-md` regenerates
[`docs/latency-budget.md`](docs/latency-budget.md) from them.

| Stage | p50 | p95 | target | met |
|---|---:|---:|---:|:--:|
| End-of-utterance detection | 772 ms | 800 ms | 350 ms | no |
| Transcription | 165 ms | 204 ms | 150 ms | no |
| LLM first token | 312 ms | 366 ms | 500 ms | yes |
| TTS first byte | 163 ms | 194 ms | 150 ms | no |
| **Time to first audio** | **1412 ms** | **1487 ms** | 900 ms | no |

A turn that has to look something up takes 1475 ms at p50; one the model answers directly
takes 920 ms. Hearing the caller is the stage that misses, by a distance.

**The stages do not add up to the total, in either direction.** livekit-agents starts the
model on the transcript while the turn detector is still deciding, so thinking overlaps
hearing. Adding the stages up overstated a direct turn by 220 to 360 ms, and understated a
tool turn by 170 to 210 ms, because a tool call's own round trip belongs to no stage at all.
Earlier versions of this table did exactly that.

**Distance was the first suspect, and it was wrong.** With the agent on a laptop in India
and every provider in the United States, round trips measured Deepgram 1115 ms, Cartesia
1853 ms, Groq 423 ms, NVIDIA 106 ms, and halving `min_endpointing_delay` moved
end-of-utterance by only 10 ms. Moving the agent to `us-east`, beside the providers, made
transcription far faster (508 to 165 ms) and the model faster (492 to 312 ms), but
end-of-utterance rose, 634 to 772 ms. The cause is still open. The two candidates are
turn-detector inference on the cloud's 2 vCPU against the laptop's 8 cores, and endpointing
behaviour in livekit-agents 1.8.1. A prediction of about 730 ms was wrong.

The worker logs "at full capacity" at a load of 0.82 to 0.85, against its 0.7 threshold,
while serving a single call: one conversation uses most of those two vCPUs.

These are agent-side numbers. They stop at the agent's first audio frame and do not count
the trip out to the caller.

## Design decisions

**Groq leads the model chain, and Nemotron was demoted on evidence.** Nemotron was the
intended brain and its tool calling is faultless. But NVIDIA NIM's free tier measured a
median time-to-first-token of 597 ms against a worst case of 5203 ms, and it timed out
repeatedly on the second call of a turn, the one carrying a tool result back to the
model. In one live call that cost 5.6 seconds of silence. Groq's `qwen3.8-27b` measured
355 ms median, 456 ms worst, with no failures across every run. On a phone call the p95
is what people hang up on, so Groq leads and Nemotron covers Groq's rate limits.

**The Groq model is now `gpt-oss-20b`, chosen on tool use rather than speed.** Pinning
`qwen3.8-27b` to a low temperature made it announce "let me get the details for you" without
ever calling a tool, so the caller heard a promise and then silence. At its default
temperature it did call tools, but spoke a preamble first. `gpt-oss-20b` searched the
knowledge base silently and answered from it in six of six full turns, with
`reasoning_effort` set low to keep its hidden reasoning to 7 to 19 tokens.

**A second tier covers Groq's free limits.** Groq's free tier allows 8,000 tokens a
minute and 1,000 requests a day, which is about three tool turns a minute. When it runs out
the chain goes to the same `gpt-oss-20b` through OpenRouter, paid and served from
OpenRouter's own Groq capacity, with NVIDIA's free endpoint last. Two other models were
tried in that slot and dropped for answering from memory; the numbers are in the decisions
log. Proven in production by holding the Groq budget at zero from a laptop: the deployed
agent was refused with 429, switched, and still answered from the knowledge base, 200 ms
later than usual.

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
- 59 unit tests over the tools, the settings, the metrics aggregation and the outbound
  answer gate.

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

## Deploying

The agent and the web page deploy separately.

**Agent, to LiveKit Cloud.** The repo root holds the `Dockerfile` and `livekit.toml`. Provider
keys go in as LiveKit secrets, from a file holding only what the agent reads. Never include
`LIVEKIT_*`, which LiveKit injects itself:

```bash
lk agent deploy --region us-east --secrets-file agent-secrets.env .
```

`us-east` puts the agent beside Deepgram, Groq and Cartesia. LiveKit requires the container to
launch only the agent, so the MCP tool server runs as a stdio child rather than a second
service.

**Web, to Vercel**, from `web/`:

```bash
vercel deploy --prod
```

with `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` set on the project. Dial-out is
off in production: `/api/call` returns 403 unless `DIAL_OUT_ENABLED=1`, because a public
dial-out endpoint would let anyone ring numbers on the Twilio account.

The worker uses automatic dispatch, so a local `python main.py dev` competes with the
deployed agent for rooms. Stop it whenever the deployed agent should be answering.

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
