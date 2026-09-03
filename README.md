# SONAR

A real-time, interruptible voice agent for a fictional solar company. Reachable from a web
page or an ordinary phone number — it answers calls and places them.

**Stack:** LiveKit Agents · Deepgram (STT) · Groq + NVIDIA Nemotron (LLM) · Cartesia (TTS) ·
MCP tools over SQLite · Twilio SIP · Next.js

> Under construction. Design: [`docs/superpowers/specs/2026-09-03-sonar-voice-agent-design.md`](docs/superpowers/specs/2026-09-03-sonar-voice-agent-design.md)

## Status

| Stage | | |
|---|---|---|
| 1 | Repo skeleton | done |
| 2 | MCP tool server | done |
| 3 | Agent worker (STT/LLM/TTS) | done |
| 4 | Tools + prompts wired | done |
| 5 | Fallback + metrics | in progress |
| 6 | Web app | |
| 7 | Twilio inbound | |
| 8 | Twilio outbound | |
| 9 | Tuning, docs, demo | |

## Running locally

```bash
cp .env.example .env     # then fill in the credentials
make setup
make mcp                 # terminal 1
make agent               # terminal 2
make web                 # terminal 3
```

## Licence

MIT
