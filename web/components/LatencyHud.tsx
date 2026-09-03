"use client";

import { useDataChannel } from "@livekit/components-react";
import { useCallback, useState } from "react";
import { median, STAGES, TTFA_TARGET, type TurnMetrics } from "@/lib/types";

/**
 * Live per-stage latency, published by the agent on every completed turn.
 *
 * Each bar is drawn against its own target with the target marked, so a stage that
 * blew its budget is visible without reading a number. That honesty is the point of
 * the panel: this project's finding is that a good median can hide a bad tail.
 */
export function LatencyHud() {
  const [turns, setTurns] = useState<TurnMetrics[]>([]);

  const onFrame = useCallback((msg: { payload: Uint8Array }) => {
    try {
      const turn = JSON.parse(new TextDecoder().decode(msg.payload)) as TurnMetrics;
      setTurns((prev) => [...prev, turn].slice(-50));
    } catch {
      // A malformed telemetry frame must never take the call down with it.
    }
  }, []);

  // The callback form, not an effect on `message`: an effect fires once per render
  // rather than once per frame, and would drop turns that arrive in quick succession.
  useDataChannel("sonar.metrics", onFrame);

  const last = turns.at(-1);
  const p50 = median(turns.map((t) => t.ttfa_estimate_ms));

  return (
    <section aria-labelledby="latency-heading" className="flex shrink-0 flex-col">
      <header className="flex items-baseline justify-between border-b border-ink-850 px-5 py-4">
        <h2 id="latency-heading" className="text-sm font-medium text-ink-200">
          Latency
        </h2>
        <span className="tnum text-xs text-ink-600">
          {turns.length} {turns.length === 1 ? "turn" : "turns"}
        </span>
      </header>

      {!last ? (
        <p className="px-5 py-6 text-sm leading-relaxed text-ink-600">
          Start a call and say something. Every turn is timed stage by stage and the
          numbers land here as it happens.
        </p>
      ) : (
        <div className="flex flex-col gap-6 px-5 py-5">
          <div key={last.speech_id} className="rise">
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wider text-ink-600">
                Time to first audio
              </span>
              {turns.length > 1 && (
                <span className="tnum text-xs text-ink-600">
                  median {Math.round(p50)} ms
                </span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className="tnum text-4xl font-semibold tracking-tight"
                style={{
                  color:
                    last.ttfa_estimate_ms <= TTFA_TARGET
                      ? "var(--color-under)"
                      : "var(--color-over)",
                }}
              >
                {Math.round(last.ttfa_estimate_ms)}
              </span>
              <span className="text-sm text-ink-600">ms</span>
              <span className="ml-auto tnum text-xs text-ink-600">
                target {TTFA_TARGET} ms
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {STAGES.map((stage) => {
              const value = last[stage.key] ?? 0;
              // Scale every bar to the same ceiling so stages are visually comparable.
              const ceiling = Math.max(stage.target * 2, value * 1.15);
              const over = value > stage.target;
              return (
                <div key={stage.key}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-ink-400">{stage.label}</span>
                    <span className="tnum text-ink-200">{Math.round(value)} ms</span>
                  </div>
                  <div className="relative mt-1.5 h-1.5 rounded-full bg-ink-850">
                    <div
                      className="h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out-strong)]"
                      style={{
                        width: `${Math.min(100, (value / ceiling) * 100)}%`,
                        background: over ? "var(--color-over)" : "var(--color-under)",
                      }}
                    />
                    <span
                      aria-hidden
                      className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink-600"
                      style={{ left: `${(stage.target / ceiling) * 100}%` }}
                      title={`target ${stage.target} ms`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <dl className="grid grid-cols-3 gap-3 border-t border-ink-850 pt-4 text-xs">
            {[
              ["Heard by", last.stt_provider],
              ["Thought by", last.llm_provider],
              ["Spoken by", last.tts_provider],
            ].map(([label, who]) => (
              <div key={label}>
                <dt className="text-ink-600">{label}</dt>
                <dd className="mt-0.5 truncate text-ink-200">{who ?? "n/a"}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
