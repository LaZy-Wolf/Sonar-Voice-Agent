"""Latency table from the per-turn records the agent writes.

    python scripts/latency_report.py [--jsonl agent/data/turns.jsonl] [--markdown]

Prints n, p50, p95 and max per stage, split by which LLM served the turn. `--markdown`
writes docs/latency-budget.md. Standard library only.

p95 is reported next to p50 deliberately. This project's whole finding is that a good
median can hide a tail bad enough to end a phone call, so a table with only medians
would misrepresent it.
"""

from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# field, label, p50 target in ms (from the design spec)
STAGES = [
    ("eou_delay_ms", "End-of-utterance", 350),
    ("transcription_delay_ms", "Transcription", 150),
    ("llm_ttft_ms", "LLM first token", 500),
    ("tts_ttfb_ms", "TTS first byte", 150),
    ("ttfa_estimate_ms", "Time-to-first-audio", 900),
]


def pct(values: list[float], p: float) -> float:
    """Nearest-rank percentile. n is small here, so no interpolation games."""
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, round(p / 100 * len(ordered) + 0.5) - 1))
    return ordered[idx]


def summarise(turns: list[dict]) -> list[tuple]:
    rows = []
    for field, label, target in STAGES:
        vals = [t[field] for t in turns if isinstance(t.get(field), int | float)]
        if not vals:
            continue
        rows.append(
            (label, len(vals), statistics.median(vals), pct(vals, 95), max(vals), target)
        )
    return rows


def render(rows: list[tuple], markdown: bool) -> str:
    if markdown:
        out = ["| Stage | n | p50 | p95 | max | target (p50) | met |",
               "|---|---:|---:|---:|---:|---:|:--:|"]
        for label, n, p50, p95, mx, target in rows:
            out.append(f"| {label} | {n} | {p50:.0f} ms | {p95:.0f} ms | {mx:.0f} ms | "
                       f"{target} ms | {'yes' if p50 <= target else 'no'} |")
        return "\n".join(out)

    out = [f"{'Stage':<22}{'n':>5}{'p50':>9}{'p95':>9}{'max':>9}{'target':>9}  ",
           "-" * 68]
    for label, n, p50, p95, mx, target in rows:
        flag = "ok" if p50 <= target else "OVER"
        out.append(f"{label:<22}{n:>5}{p50:>8.0f}ms{p95:>8.0f}ms{mx:>8.0f}ms"
                   f"{target:>7}ms  {flag}")
    return "\n".join(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsonl", default=str(ROOT / "agent" / "data" / "turns.jsonl"))
    ap.add_argument("--markdown", action="store_true", help="write docs/latency-budget.md")
    args = ap.parse_args()

    path = Path(args.jsonl)
    if not path.exists():
        print(f"No metrics at {path}. Run the agent and talk to it first.")
        return 1

    turns = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            try:
                turns.append(json.loads(line))
            except json.JSONDecodeError:
                continue          # a half-written final line during a live call
    if not turns:
        print(f"{path} has no complete turns yet.")
        return 1

    print(f"\n{len(turns)} turns from {path}\n")
    print(render(summarise(turns), markdown=False))

    by_llm: dict[str, list] = defaultdict(list)
    for t in turns:
        by_llm[t.get("llm_provider", "unknown")].append(t)
    if len(by_llm) > 1:
        for provider, rows in sorted(by_llm.items()):
            print(f"\n-- {provider} ({len(rows)} turns) --")
            print(render(summarise(rows), markdown=False))

    if args.markdown:
        doc = ROOT / "docs" / "latency-budget.md"
        body = [
            "# Latency budget",
            "",
            f"Measured over {len(turns)} turns. Regenerate with `make report-md`.",
            "",
            render(summarise(turns), markdown=True),
            "",
        ]
        for provider, rows in sorted(by_llm.items()):
            body += [f"## {provider} ({len(rows)} turns)", "",
                     render(summarise(rows), markdown=True), ""]
        doc.write_text("\n".join(body), encoding="utf-8")
        print(f"\nwrote {doc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
