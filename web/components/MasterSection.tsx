"use client";

import { BarVisualizer, useVoiceAssistant } from "@livekit/components-react";
import type { ConnectionState } from "livekit-client";
import { MEASURED } from "@/lib/types";

type Props = {
  connection: ConnectionState | "connecting";
  micMuted: boolean;
  onStart: () => void;
  onEnd: () => void;
  onToggleMic: () => void;
  error?: string;
};

const STATE_COPY: Record<string, string> = {
  initializing: "Warming up",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

/** The master section of the desk: what you talk into, and what it costs you to wait. */
export function MasterSection({
  connection,
  micMuted,
  onStart,
  onEnd,
  onToggleMic,
  error,
}: Props) {
  const { state, audioTrack } = useVoiceAssistant();
  const live = connection === "connected";
  const busy = connection === "connecting";

  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-14 sm:px-10 lg:pt-20">
      <h1 className=" max-w-[13ch] text-[clamp(2.75rem,8vw,5rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-face">
        It picks up the phone.
      </h1>

      <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-legend">
        A voice agent that answers questions, looks customers up and books site visits,
        over a browser or an ordinary phone line. Every stage of every turn is timed on
        this desk while you speak, including the stages that miss their target.
      </p>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={live ? onEnd : onStart}
              disabled={busy}
              className={
                "legend rounded-[4px] px-7 py-3.5 text-[12px] transition-transform duration-150 " +
                "active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 " +
                (live
                  ? "raised text-legend hover:text-face"
                  : "bg-signal text-panel-900 hover:bg-face")
              }
            >
              {live ? "End call" : busy ? "Connecting" : "Start talking"}
            </button>

            {live && (
              <button
                type="button"
                onClick={onToggleMic}
                aria-pressed={micMuted}
                className="legend raised rounded-[4px] px-5 py-3.5 text-[12px] text-legend transition-transform duration-150 hover:text-face active:scale-[0.985]"
              >
                {micMuted ? "Unmute" : "Mute"}
              </button>
            )}

            <span className="ml-1 flex items-center gap-2.5">
              <PowerLamp on={live} />
              <span aria-live="polite" className="legend text-[11px] text-legend-dim">
                {live ? STATE_COPY[state] ?? "Connected" : busy ? "Connecting" : "Idle"}
              </span>
            </span>
          </div>

          {error && (
            <p role="alert" className="max-w-[52ch] text-sm text-over">
              {error}
            </p>
          )}

          <div className="raised h-16 rounded-[3px] px-4">
            {live ? (
              <BarVisualizer
                state={state}
                barCount={24}
                trackRef={audioTrack}
                options={{ minHeight: 6 }}
                className="flex h-full w-full items-center justify-center gap-[3px] [&>span]:w-[5px] [&>span]:rounded-[1px] [&>span]:bg-engrave [&>span[data-lk-highlighted=true]]:bg-signal"
              />
            ) : (
              <div className="flex h-full items-center gap-[3px]" aria-hidden>
                {Array.from({ length: 24 }).map((_, i) => (
                  <span key={i} className="h-[6px] w-[5px] rounded-[1px] bg-engrave" />
                ))}
              </div>
            )}
          </div>

          <p className="max-w-[52ch] text-xs leading-relaxed text-legend-dim">
            Your browser will ask for the microphone. Nothing is recorded. Interrupt it
            mid-sentence to see how fast it stops.
          </p>
        </div>

        {/* Not a hero statistic: the headline number is engraved on the desk as a plate,
            with the target beside it and the honest phone figure underneath. */}
        <dl className="raised w-full max-w-xs shrink-0 rounded-[3px] p-5">
          <dt className="legend text-[10px] text-legend-dim">Time to first audio</dt>
          <dd className="mt-2 flex items-baseline gap-2">
            <span className="figure text-[2.75rem] leading-none text-face">
              {MEASURED.browser.p50}
            </span>
            <span className="figure text-xs text-legend-dim">ms p50</span>
          </dd>
          <dd className="figure mt-3 flex justify-between border-t border-engrave pt-3 text-[11px] text-legend-dim">
            <span>p95</span>
            <span>{MEASURED.browser.p95} ms</span>
          </dd>
          <dd className="figure mt-1.5 flex justify-between text-[11px] text-legend-dim">
            <span>over a phone</span>
            <span>{MEASURED.phone.p50} ms</span>
          </dd>
          <dd className="figure mt-1.5 flex justify-between text-[11px]">
            <span className="text-legend-dim">target</span>
            <span className="text-over">900 ms · missed</span>
          </dd>
        </dl>
      </div>
    </section>
  );
}

function PowerLamp({ on }: { on: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5" aria-hidden>
      <span
        className="h-2.5 w-2.5 rounded-full transition-colors duration-300"
        style={{
          background: on ? "var(--color-signal)" : "var(--color-engrave)",
          boxShadow: on ? "0 0 10px 1px oklch(76% 0.15 68 / 0.55)" : "none",
        }}
      />
    </span>
  );
}
