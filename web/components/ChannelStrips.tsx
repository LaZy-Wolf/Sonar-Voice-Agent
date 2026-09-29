"use client";

import { useState } from "react";
import { Meter } from "@/components/Meter";
import { median, STAGES, TTFA_TARGET, type TurnMetrics } from "@/lib/types";

/**
 * Four meters, one per pipeline stage, fed by the agent's own metrics for this session.
 *
 * Selecting a turn isolates it and dims the rest of the session, so a single reading can
 * be inspected without losing where it sat among the others.
 */
export function LiveReadings({ turns }: { turns: TurnMetrics[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const shown = selected ? turns.find((t) => t.speech_id === selected) : turns.at(-1);
  const p50 = median(turns.map((t) => t.ttfa_ms));

  return (
    <div className="mt-20 border-t border-engrave pt-10">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div>
          <h3 className="text-[20px] font-semibold tracking-[-0.015em] text-face">
            Live readings, this session
          </h3>
          <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-legend-dim">
            Each stage on its own scale, with its budget marked in red. They rest at zero
            until you talk.
          </p>
        </div>

        <div className="text-right">
          <span className="legend text-[10px] text-legend-dim">
            {selected ? "Selected turn" : "Latest turn"}
          </span>
          <p className="figure mt-1 text-[28px] leading-none text-face">
            {shown ? `${Math.round(shown.ttfa_ms)} ms` : "—"}
          </p>
          {shown && (
            <p className="mt-1.5 text-[12px]">
              <span className={shown.ttfa_ms <= TTFA_TARGET ? "text-legend-dim" : "text-over"}>
                {shown.ttfa_ms <= TTFA_TARGET ? "within budget" : "over budget"}
              </span>
              <span className="text-legend-dim">
                {(shown.llm_calls ?? 1) > 1 ? " · used a tool" : ""}
                {shown.llm_provider ? ` · ${shown.llm_provider}` : ""}
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-5 lg:grid-cols-4 lg:gap-8">
        {STAGES.map((stage) => (
          <Meter
            key={stage.key}
            label={stage.label}
            target={stage.target}
            full={stage.full}
            value={
              shown && typeof shown[stage.key] === "number" ? (shown[stage.key] as number) : null
            }
          />
        ))}
      </div>

      {turns.length > 0 && (
        <div className="mt-10">
          <div className="flex items-baseline justify-between">
            <span className="legend text-[10px] text-legend-dim">
              Session · {turns.length} {turns.length === 1 ? "turn" : "turns"}
            </span>
            <span className="figure text-[11px] text-legend-dim">median {Math.round(p50)} ms</span>
          </div>

          {/* Each turn as a bar on a shared scale. Selecting one dims the rest. */}
          <ol className="mt-3 flex h-16 items-end gap-1.5">
            {turns.map((t) => {
              const isSel = selected === t.speech_id;
              const over = t.ttfa_ms > TTFA_TARGET;
              return (
                <li key={t.speech_id} className="flex h-full flex-1 items-end">
                  <button
                    type="button"
                    onClick={() => setSelected(isSel ? null : t.speech_id)}
                    aria-pressed={isSel}
                    title={`${Math.round(t.ttfa_ms)} ms`}
                    className="w-full rounded-[2px] transition-opacity duration-300 ease-[var(--ease-settle)]"
                    style={{
                      height: `${Math.max(6, Math.min(100, (t.ttfa_ms / 2400) * 100))}%`,
                      background: over ? "var(--color-over)" : "var(--color-signal-dim)",
                      opacity: selected && !isSel ? 0.22 : 1,
                    }}
                  >
                    <span className="sr-only">Turn at {Math.round(t.ttfa_ms)} milliseconds</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
