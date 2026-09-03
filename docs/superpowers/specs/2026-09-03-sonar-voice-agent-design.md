# SONAR — Real-Time Voice Agent (Design)

Date: 2026-09-03
Status: approved
Supersedes: the provider and telephony decisions in `SONAR_VOICE_AGENT_PLAN.md`

## 1. What we are building

SONAR is an interruptible, real-time voice agent that acts as the front desk for a
fictional solar-installation company, Helios Solar. It can be reached two ways:

- a web page (browser microphone over WebRTC), and
- an ordinary phone number (PSTN, both directions — it answers calls and places them).

Both entry points reach the same agent worker, because LiveKit bridges a phone call
into a room as an ordinary participant. The agent hears, thinks, speaks, can be cut
off mid-sentence, and performs real actions (customer lookup, lead creation, site-visit
booking, FAQ search) through a custom MCP server backed by SQLite.

Every turn is instrumented so the project can publish a measured per-stage latency
budget with p50/p95 figures, reported separately for browser and phone calls.

## 2. Stack

| Layer | Choice | Package |
|---|---|---|
| Agent framework | LiveKit Agents 1.7.x (Python 3.12) | `livekit-agents` |
| Transport | LiveKit Cloud (WebRTC + SIP) | — |
| VAD | Silero | `livekit-plugins-silero` |
| Turn detection | `MultilingualModel` semantic end-of-utterance | `livekit-plugins-turn-detector` |
| STT | Deepgram `nova-3`, streaming with interim results | `livekit-plugins-deepgram` |
| LLM primary | NVIDIA Nemotron via NIM OpenAI-compatible endpoint | `livekit-plugins-openai` |
| LLM fallback | Groq | `livekit-plugins-groq` |
| TTS | Cartesia Sonic | `livekit-plugins-cartesia` |
| Tools | FastMCP over streamable-HTTP, SQLite | `mcp` |
| Telephony | Twilio Elastic SIP Trunk, inbound + outbound | `livekit-api` |
| Web | Next.js 15, TypeScript, Tailwind, `@livekit/components-react` | — |
| Hosting | web on Vercel; agent worker on the laptop at demo time | — |

### 2.1 Decisions changed from the original plan

The original plan is decision-final in its own terms; these four decisions were
reopened by the project owner and this document is now authoritative for them.

- **STT is Deepgram, not Groq Whisper.** Deepgram streams with interim results;
  Groq Whisper is batch. This removes a whole latency stage rather than optimising it.
- **The local faster-whisper fallback is deleted.** A CPU Whisper fallback sitting
  behind a streaming primary is not a fallback — it is roughly ten times slower and
  would destroy the latency number the project exists to publish. Deleting it removes
  a custom STT plugin, its test, a WAV fixture and a 500 MB model download.
- **TTS is Cartesia, not Kokoro-FastAPI.** Cartesia is an API call. This deletes a
  Docker Compose service, a 3–4 GB container image and an entire deployment target.
- **The LLM chain is two tiers, not three.** The original third tier was a
  `llama.cpp` slot reserved for a follow-on project that does not exist yet. The
  seam costs nothing to reintroduce later.
- **LangGraph is not used.** LiveKit Agents already runs the listen → tool → speak
  loop and consumes MCP servers natively. `livekit-plugins-langchain` exists and
  would work, but for a front-desk assistant it is a layer with nothing to do.
- **Telephony via Twilio is added.** The original plan was browser-only.
- **WSL2 is not used.** It was only needed to run Kokoro in Docker. `uv` provides
  Python 3.12 on Windows directly.

### 2.2 Cost

The original plan's premise was "$0, no credit card". Telephony breaks that, mildly:
a US number is about $1.15/month and calls run about $0.014/minute. A Twilio trial
gives $15.50 of credit, but **inbound calls to a trial account are only accepted from
numbers verified in that account**. Everything else in the stack has a free tier.
The README must say "$0 except telephony" rather than "$0".

## 3. Architecture

```
Browser (Next.js on Vercel) ──WebRTC──┐
                                       ├──► LiveKit room ◄──► agent worker
PSTN ──► Twilio SIP trunk ──────SIP────┘                        │
                                                                ├─► Deepgram    (STT, streaming)
                                                                ├─► Nemotron    (NVIDIA NIM) → Groq fallback
                                                                ├─► Cartesia    (TTS)
                                                                └─► MCP server :8000 ──► SQLite
```

### 3.1 Dispatch

The worker uses **automatic dispatch** — `WorkerOptions` sets no `agent_name`, so the
worker joins every room created in the LiveKit project. Browser sessions and inbound
SIP calls therefore need no dispatch plumbing at all.

Outbound calls create the room first and attach the callee and the call's purpose as
**room metadata**, which the agent reads on connect.

The alternative — a named agent with explicit `AgentDispatch` on all three paths — is
more correct for a multi-agent project and is what production LiveKit deployments use.
It is rejected here because this project runs exactly one agent, and automatic dispatch
removes a dispatch call from each of the three entry paths. The cost is that the worker
will answer any room in the project, including ones created by accident.

### 3.2 Components

**`agent/`** — the worker.
- `main.py`: entrypoint. Builds the `AgentSession`, wires the MCP server, registers the
  metrics handler, reads room metadata to decide whether this is an inbound answer or
  an outbound call, and greets accordingly.
- `config.py`: pydantic-settings object plus `build_stt` / `build_llm` / `build_tts`.
  The provider chain is constructed here and nowhere else.
- `prompts.py`: system prompt and the two greeting variants (inbound, outbound).
- `metrics_sink.py`: groups per-stage metrics by `speech_id`, emits one JSON record per
  turn to JSONL, and publishes the same record on the room data channel for the browser HUD.

**`mcp-server/`** — the tools.
- `sonar_tools/tools.py`: six plain Python functions, no MCP imports. Their docstrings
  are what the model sees, so they are written as tool descriptions.
- `sonar_tools/server.py`: FastMCP wrapper, streamable-HTTP, serves at `/mcp`.
- `sonar_tools/db.py`, `seed.py`, `kb/faq.json`: SQLite schema, deterministic seed data
  (Faker, seed 42), and about 40 Helios Solar FAQ entries.

**`web/`** — Next.js. Token route, outbound-call trigger route, call panel, transcript,
latency HUD, dial-out field.

**`scripts/`** — `setup_sip.py` (creates the LiveKit trunks and dispatch rule via
`livekit-api`, so trunk configuration is code rather than console clicks),
`latency_report.py` (p50/p95 table), `warm.py` (pre-demo warm-up).

### 3.3 Tools exposed over MCP

| Tool | Purpose |
|---|---|
| `get_current_datetime` | Resolve "today" / "tomorrow" in Asia/Kolkata |
| `lookup_customer` | Find a customer by email, phone, or partial name |
| `create_lead` | Record a new sales lead |
| `check_availability` | Free site-visit slots on a date, 09:00–17:00 |
| `book_site_visit` | Book a slot for a known customer |
| `search_knowledge_base` | BM25 search over the Helios Solar FAQ |

All return JSON-serialisable dicts and never raise for user error — they return
`{"ok": false, "reason": ...}` so the model can recover conversationally.

## 4. Latency budget

Targets, measured at p50, reported separately for browser and phone.

| Stage | Metric field | Target | Original plan's target |
|---|---|---|---|
| End-of-utterance | `EOUMetrics.end_of_utterance_delay` | ≤ 350 ms | ≤ 350 ms |
| STT | `EOUMetrics.transcription_delay` | ≤ 150 ms | ≤ 400 ms |
| LLM time-to-first-token | `LLMMetrics.ttft` | ≤ 500 ms | ≤ 450 ms |
| TTS time-to-first-byte | `TTSMetrics.ttfb` | ≤ 150 ms | ≤ 300 ms |
| **Time-to-first-audio** | computed sum | **≤ 900 ms** | ≤ 1.2 s |

The STT and TTS targets tighten because streaming STT and a hosted TTS both remove
work that the original CPU-bound stack had to do. PSTN transit adds roughly 100–200 ms,
which is why phone and browser are reported as two numbers rather than one average.

### 4.1 Known risk: Nemotron is a reasoning model

Nemotron 3 Super reasons before emitting tokens, which is the wrong shape for a
500 ms TTFT budget — reasoning models routinely spend seconds before the first token.
It exposes a reasoning on/off control.

**Mitigation, executed at stage 3 before anything is built on top of it:** measure TTFT
with reasoning disabled. If it still misses the budget, drop to a smaller non-reasoning
Nemotron variant. If that also misses, Nemotron becomes the fallback and Groq becomes
primary, and the README says so. This is cheap to discover at stage 3 and expensive to
discover at stage 9.

## 5. Build order

Each stage ends with green tests and one commit.

| # | Stage | Done when | Creds needed |
|---|---|---|---|
| 1 | Repo skeleton, spec, CI, Makefile, env files | CI green | none |
| 2 | MCP server, seed data, tests | 6 tools listed; `test_tools.py` green | none |
| 3 | Agent: Deepgram + Nemotron + Cartesia | talkable in LiveKit Agents Playground; **TTFT measured** | group A |
| 4 | MCP tools + prompts wired in | a spoken booking request writes to SQLite | group A |
| 5 | LLM fallback, metrics sink, report script | 10 turns produce a full `make report` table | + group B |
| 6 | Web app: token route, call panel, transcript, HUD | works from desktop Chrome and a phone | group A |
| 7 | Twilio inbound | dialling the number reaches the agent | + group C |
| 8 | Twilio outbound | `/api/call` makes the agent ring a phone | group C |
| 9 | Tuning, README, latency table, demo recording | done checklist complete | — |

Credential groups: **A** = LiveKit ×3, Deepgram, NVIDIA, Cartesia. **B** = Groq.
**C** = Twilio SID/token/number plus SIP trunk credentials.

## 6. Testing

- `mcp-server/tests/test_tools.py` — seeds a temp DB; asserts lookup by email, phone and
  partial name; lead validation; availability excluding seeded bookings; booking conflict
  returning `ok: false`; KB search returning the warranty entry for a warranty question.
- `agent/tests/test_config.py` — provider chain construction and env parsing.
- `agent/tests/test_metrics_sink.py` — turn aggregation from fake metric objects,
  including the case where a turn is interrupted and never completes.
- CI runs `ruff` and `pytest` on both Python packages and `npm run build` on `web/`.

Interruption is verified by hand, not in CI: while the agent reads a long FAQ answer,
say "stop" — audio must cut within about 300 ms and the agent must respond to the new
utterance.

## 7. Explicitly out of scope

Local/offline model tiers, a second "training data" project, self-hosted LiveKit,
noise cancellation, multi-language support, authentication, and any persistence beyond
the demo SQLite file. Each is a paragraph in the original plan; none is needed to
demonstrate what this project demonstrates.
