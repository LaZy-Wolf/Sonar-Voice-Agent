"use client";

import { BarVisualizer, useVoiceAssistant } from "@livekit/components-react";
import type { ConnectionState } from "livekit-client";

type Props = {
  connection: ConnectionState | "connecting";
  micMuted: boolean;
  onStart: () => void;
  onEnd: () => void;
  onToggleMic: () => void;
  error?: string;
};

/** What the agent is doing right now, in words a visitor understands. */
const STATE_COPY: Record<string, string> = {
  initializing: "Waking up",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

export function CallPanel({
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
    <div className="flex h-full flex-col gap-10 p-8 lg:min-h-dvh">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-50">
          Sonar
        </h1>
        <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-ink-400">
          The front desk for Helios Solar, a fictional rooftop installer. Ask
          about warranties, prices or subsidies, book a site visit, or interrupt
          mid-sentence to see how fast it stops.
        </p>
      </div>

      {/* Visualiser, state and controls are one cluster: spreading them across the
          column made three unrelated-looking things instead of one instrument. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="h-20 w-full max-w-sm">
          {live ? (
            <BarVisualizer
              state={state}
              barCount={7}
              trackRef={audioTrack}
              options={{ minHeight: 8 }}
              className="flex h-full w-full items-center justify-center gap-1.5 [&>span]:w-3 [&>span]:rounded-full [&>span]:bg-ink-800 [&>span[data-lk-highlighted=true]]:bg-solar-400"
            />
          ) : (
            <div
              className="flex h-full items-center justify-center gap-1.5"
              aria-hidden
            >
              {Array.from({ length: 7 }).map((_, i) => (
                <span key={i} className="h-2 w-3 rounded-full bg-ink-850" />
              ))}
            </div>
          )}
        </div>

        <p aria-live="polite" className="h-5 text-sm text-ink-400">
          {live ? (
            <span className="inline-flex items-center gap-2">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-solar-400" />
              {STATE_COPY[state] ?? "Connected"}
            </span>
          ) : busy ? (
            "Connecting"
          ) : (
            "Not connected"
          )}
        </p>

        <div className="flex w-full max-w-sm flex-col gap-3 pt-2">
          {error && (
            <p role="alert" className="text-sm text-[var(--color-over)]">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={live ? onEnd : onStart}
              disabled={busy}
              className={
                "flex-1 rounded-lg px-5 py-3 text-sm font-medium transition-colors duration-150 " +
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solar-400 " +
                "active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 " +
                (live
                  ? "bg-ink-800 text-ink-100 hover:bg-ink-850"
                  : "bg-solar-500 text-ink-950 hover:bg-solar-400")
              }
            >
              {live ? "End call" : busy ? "Connecting" : "Start call"}
            </button>

            {live && (
              <button
                type="button"
                onClick={onToggleMic}
                aria-pressed={micMuted}
                className="rounded-lg border border-ink-800 px-5 py-3 text-sm font-medium text-ink-200 transition-colors duration-150 hover:bg-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solar-400 active:scale-[0.99]"
              >
                {micMuted ? "Unmute" : "Mute"}
              </button>
            )}
          </div>

          <p className="text-xs leading-relaxed text-ink-600">
            Your browser will ask for microphone access. Nothing is recorded.
          </p>
        </div>
      </div>
    </div>
  );
}
