# Latency budget

Measured over 5 turns from `docs/measurements/us-east-2026-09-11.jsonl`. Regenerate with `make report-md`.

| Stage | n | p50 | p95 | max | target (p50) | met |
|---|---:|---:|---:|---:|---:|:--:|
| End-of-utterance | 5 | 772 ms | 800 ms | 800 ms | 350 ms | no |
| Transcription | 5 | 165 ms | 204 ms | 204 ms | 150 ms | no |
| LLM first token | 5 | 312 ms | 366 ms | 366 ms | 500 ms | yes |
| TTS first byte | 5 | 163 ms | 194 ms | 194 ms | 150 ms | no |
| Time-to-first-audio | 5 | 1412 ms | 1487 ms | 1487 ms | 900 ms | no |

## api.groq.com (5 turns)

| Stage | n | p50 | p95 | max | target (p50) | met |
|---|---:|---:|---:|---:|---:|:--:|
| End-of-utterance | 5 | 772 ms | 800 ms | 800 ms | 350 ms | no |
| Transcription | 5 | 165 ms | 204 ms | 204 ms | 150 ms | no |
| LLM first token | 5 | 312 ms | 366 ms | 366 ms | 500 ms | yes |
| TTS first byte | 5 | 163 ms | 194 ms | 194 ms | 150 ms | no |
| Time-to-first-audio | 5 | 1412 ms | 1487 ms | 1487 ms | 900 ms | no |
