"use client";

import { useDataChannel } from "@livekit/components-react";
import { useCallback, useState } from "react";
import { Meter } from "@/components/Meter";
import { useReveal } from "@/lib/useReveal";
import { median, STAGES, TTFA_TARGET, type TurnMetrics } from "@/lib/types";

/**
 * Four channel strips, one per pipeline stage, fed by the agent's own metrics.
 *
 * Selecting a turn isolates it and dims the rest of the session, so a single reading can
 * be inspected without losing where it sat among the others.
 */
export function ChannelStrips() {
  const [turns, setTurns] = useState<TurnMetrics[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const ref = useReveal<HTMLElement>();

  const onFrame = useCallback((msg: { payload: Uint8Array }) => {
    try {
      const turn = JSON.parse(new TextDecoder().decode(msg.payload)) as TurnMetrics;
      setTurns((prev) => [...prev, turn].slice(-40));
    } catch {
      // A malformed telemetry frame must never take the call down with it.
    }
  }, []);

  useDataChannel("sonar.metrics", onFrame);

  const shown = selected ? turns.find((t) => t.speech_id === selected) : turns.at(-1);
  const p50 = median(turns.map((t) => t.ttfa_estimate_ms));

  return (
    <section ref={ref} className="reveal scored" aria-labelledby="strips-heading">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10">
        <h2
          id="strips-heading"
          className="max-w-[20ch] text-[clamp(1.5rem,3.2vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em] text-face"
        >
          Four stages, each with its budget engraved on the scale.
        </h2>
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-legend">
          A needle past the red mark is a stage over its target. These move while you talk;
          before that they rest at zero.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-8">
          {STAGES.map((stage) => (
            <Meter
              key={stage.key}
              label={stage.label}
              target={stage.target}
              full={stage.full}
              value={
                shown && typeof shown[stage.key] === "number"
                  ? (shown[stage.key] as number)
                  : null
              }
            />
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t border-engrave pt-6">
          <div>
            <span className="legend text-[10px] text-legend-dim">
              {selected ? "Selected turn" : "Latest turn"}
            </span>
            <p className="figure mt-1.5 text-2xl text-face">
              {shown ? `${Math.round(shown.ttfa_estimate_ms)} ms` : "—"}
              {shown && (
                <span
                  className="ml-2 text-[11px]"
                  style={{
                    color:
                      shown.ttfa_estimate_ms <= TTFA_TARGET
                        ? "var(--color-legend-dim)"
                        : "var(--color-over)",
                  }}
                >
                  {shown.ttfa_estimate_ms <= TTFA_TARGET ? "within budget" : "over budget"}
                </span>
              )}
            </p>
          </div>

          {shown && (
            <dl className="flex gap-6 text-[11px]">
              {[
                ["heard by", shown.stt_provider],
                ["thought by", shown.llm_provider],
                ["spoken by", shown.tts_provider],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="legend text-[9px] text-legend-dim">{k}</dt>
                  <dd className="figure mt-1 text-legend">{v ?? "n/a"}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {turns.length > 0 && (
          <div className="mt-8">
            <div className="flex items-baseline justify-between">
              <span className="legend text-[10px] text-legend-dim">
                Session · {turns.length} {turns.length === 1 ? "turn" : "turns"}
              </span>
              <span className="figure text-[11px] text-legend-dim">
                median {Math.round(p50)} ms
              </span>
            </div>

            {/* Each turn as a bar on a shared scale. Selecting one dims the rest. */}
            <ol className="mt-3 flex h-16 items-end gap-1.5">
              {turns.map((t) => {
                const isSel = selected === t.speech_id;
                const over = t.ttfa_estimate_ms > TTFA_TARGET;
                return (
                  <li key={t.speech_id} className="flex h-full flex-1 items-end">
                    <button
                      type="button"
                      onClick={() => setSelected(isSel ? null : t.speech_id)}
                      aria-pressed={isSel}
                      title={`${Math.round(t.ttfa_estimate_ms)} ms`}
                      className="w-full rounded-[1px] transition-[opacity,height] duration-300 ease-[var(--ease-settle)]"
                      style={{
                        height: `${Math.max(6, Math.min(100, (t.ttfa_estimate_ms / 2400) * 100))}%`,
                        background: over ? "var(--color-over)" : "var(--color-signal-dim)",
                        opacity: selected && !isSel ? 0.22 : 1,
                      }}
                    >
                      <span className="sr-only">
                        Turn at {Math.round(t.ttfa_estimate_ms)} milliseconds
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
