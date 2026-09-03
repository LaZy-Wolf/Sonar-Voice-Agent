# Latency budget

Measured over 6 turns. Regenerate with `make report-md`.

| Stage | n | p50 | p95 | max | target (p50) | met |
|---|---:|---:|---:|---:|---:|:--:|
| End-of-utterance | 6 | 634 ms | 646 ms | 646 ms | 350 ms | no |
| Transcription | 6 | 508 ms | 537 ms | 537 ms | 150 ms | no |
| LLM first token | 6 | 492 ms | 721 ms | 721 ms | 500 ms | yes |
| TTS first byte | 6 | 129 ms | 195 ms | 195 ms | 150 ms | yes |
| Time-to-first-audio | 6 | 1299 ms | 1473 ms | 1473 ms | 900 ms | no |

## groq (6 turns)

| Stage | n | p50 | p95 | max | target (p50) | met |
|---|---:|---:|---:|---:|---:|:--:|
| End-of-utterance | 6 | 634 ms | 646 ms | 646 ms | 350 ms | no |
| Transcription | 6 | 508 ms | 537 ms | 537 ms | 150 ms | no |
| LLM first token | 6 | 492 ms | 721 ms | 721 ms | 500 ms | yes |
| TTS first byte | 6 | 129 ms | 195 ms | 195 ms | 150 ms | yes |
| Time-to-first-audio | 6 | 1299 ms | 1473 ms | 1473 ms | 900 ms | no |
