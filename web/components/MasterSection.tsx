"use client";

import {
  BarVisualizer,
  useRoomContext,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import type { ConnectionState } from "livekit-client";
import type { CSSProperties } from "react";
import { MEASURED, REPO, type TurnMetrics } from "@/lib/types";

type Props = {
  connection: ConnectionState | "connecting";
  micMuted: boolean;
  onStart: () => void;
  onEnd: () => void;
  onToggleMic: () => void;
  error?: string;
  turns: TurnMetrics[];
};

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

/** The first screen: what it is, the one control, and the console it talks through. */
export function MasterSection({
  connection,
  micMuted,
  onStart,
  onEnd,
  onToggleMic,
  error,
  turns,
}: Props) {
  const live = connection === "connected";
  const busy = connection === "connecting";

  return (
    <section id="console" className="relative overflow-hidden">
      {/* The console is the one lit object in the room; this is the light it throws. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-56 h-[44rem] w-[44rem] rounded-full opacity-[0.09] blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--color-signal), transparent)" }}
      />

      <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-6 pb-20 pt-14 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,29rem)] lg:items-center lg:pb-28 lg:pt-20">
        <div>
          <h1
            className="rise max-w-[12ch] text-[clamp(3rem,7.2vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-face"
            style={d(0)}
          >
            It picks up the phone.
          </h1>

          <p className="rise mt-7 max-w-[46ch] text-[17px] leading-[1.6] text-legend" style={d(80)}>
            A voice agent that answers questions, looks customers up and books site visits,
            in the browser or on an ordinary phone line. Every stage of every turn is timed
            while you speak, including the stages that miss.
          </p>

          <div className="rise mt-10 flex flex-wrap items-center gap-3" style={d(160)}>
            <button
              type="button"
              onClick={live ? onEnd : onStart}
              disabled={busy}
              className={
                "legend flex min-h-12 items-center gap-2.5 rounded-[6px] px-6 text-[12px] transition-[transform,background-color,color] duration-200 ease-[var(--ease-settle)] " +
                "active:scale-[0.97] disabled:cursor-wait disabled:opacity-60 " +
                (live
                  ? "raised text-face hover:text-over"
                  : "bg-signal text-panel-900 shadow-[0_8px_24px_-10px_var(--color-signal)] hover:bg-face")
              }
            >
              {live ? <StopGlyph /> : <MicGlyph />}
              {live ? "End call" : busy ? "Connecting" : "Start talking"}
            </button>

            {live && (
              <button
                type="button"
                onClick={onToggleMic}
                aria-pressed={micMuted}
                className="legend raised min-h-12 rounded-[6px] px-5 text-[12px] text-legend transition-[transform,color] duration-200 hover:text-face active:scale-[0.97]"
              >
                {micMuted ? "Unmute" : "Mute"}
              </button>
            )}

            <a
              href={REPO}
              className="group -ml-2 flex min-h-12 items-center gap-1.5 px-2 text-[14px] sm:ml-2 text-legend transition-colors duration-200 hover:text-face"
            >
              Read the source
              <span aria-hidden className="transition-transform duration-200 ease-[var(--ease-settle)] group-hover:translate-x-0.5">
                →
              </span>
            </a>
          </div>

          {error && (
            <p role="alert" className="mt-5 max-w-[52ch] text-[14px] text-over">
              {error}
            </p>
          )}

          <p className="rise mt-6 max-w-[54ch] text-[13px] leading-relaxed text-legend-dim" style={d(220)}>
            Your browser asks for the microphone; nothing is recorded. The agent sleeps when
            nobody is using it, so the first call after a quiet spell takes 10 to 20 seconds
            to connect. Interrupt it mid-sentence to see how fast it stops.
          </p>

          <dl className="rise mt-12 flex flex-wrap gap-x-10 gap-y-5 border-t border-engrave pt-6" style={d(280)}>
            <Spec term="Time to first audio" value={`${MEASURED.browser.p50} ms`} note="p50, target 900 ms, missed" over />
            <Spec term="Tools" value="6" note="over MCP and SQLite" />
            <Spec term="Pickup to first word" value="1.64 s" note="on a phone call" />
          </dl>
        </div>

        <Console live={live} busy={busy} turns={turns} />
      </div>
    </section>
  );
}

function Spec({ term, value, note, over }: { term: string; value: string; note: string; over?: boolean }) {
  return (
    <div>
      <dt className="legend text-[10px] text-legend-dim">{term}</dt>
      <dd className="figure mt-2 text-[22px] leading-none text-face">{value}</dd>
      <dd className={"mt-1.5 text-[12px] " + (over ? "text-over" : "text-legend-dim")}>{note}</dd>
    </div>
  );
}

const STATES = [
  ["listening", "Listening"],
  ["thinking", "Thinking"],
  ["speaking", "Speaking"],
] as const;

const PROMPTS = [
  "How long is the warranty on the panels?",
  "What does a five kilowatt system cost?",
  "Can someone visit on Friday morning?",
];

/** What you talk into: the state it is in, the signal, and what both sides said. */
function Console({ live, busy, turns }: { live: boolean; busy: boolean; turns: TurnMetrics[] }) {
  const { state, audioTrack } = useVoiceAssistant();
  const room = useRoomContext();
  const segments = useTranscriptions().slice(-6);
  const last = turns.at(-1);

  return (
    <div className="rise raised rounded-[14px] p-2" style={d(200)}>
      <div className="well overflow-hidden rounded-[9px]">
        <div className="flex items-center justify-between border-b border-engrave/70 px-5 py-3.5">
          <span className="legend text-[10px] text-legend-dim">Console</span>
          <ol className="flex items-center gap-4" aria-label="Agent state">
            {STATES.map(([key, label]) => {
              const on = live && state === key;
              return (
                <li
                  key={key}
                  aria-current={on ? "step" : undefined}
                  className="legend flex items-center gap-1.5 text-[9.5px] transition-colors duration-200"
                  style={{ color: on ? "var(--color-signal)" : "var(--color-legend-dim)" }}
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full transition-colors duration-200"
                    style={{ background: on ? "var(--color-signal)" : "var(--color-panel-700)" }}
                  />
                  {label}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="h-28 px-5">
          {live ? (
            <BarVisualizer
              state={state}
              barCount={28}
              trackRef={audioTrack}
              options={{ minHeight: 4 }}
              className="flex h-full w-full items-center justify-between [&>span]:w-[6px] [&>span]:rounded-full [&>span]:bg-panel-700 [&>span]:transition-colors [&>span[data-lk-highlighted=true]]:bg-signal"
            />
          ) : (
            <IdleTrace connecting={busy} />
          )}
        </div>

        <div
          className="flex h-52 flex-col justify-end gap-3 border-t border-engrave/70 px-5 py-4"
          style={{ maskImage: "linear-gradient(to bottom, transparent, black 38%)" }}
          aria-live="polite"
        >
          {segments.length === 0 ? (
            <div>
              <p className="legend text-[9.5px] text-legend-dim">Try asking</p>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {PROMPTS.map((p) => (
                  <li key={p} className="text-[14px] text-legend">
                    &ldquo;{p}&rdquo;
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            segments.map((s) => {
              const you = s.participantInfo.identity === room.localParticipant.identity;
              return (
                <p key={s.streamInfo.id} className="text-[14px] leading-snug">
                  <span
                    className="legend mr-2 text-[9px]"
                    style={{ color: you ? "var(--color-legend-dim)" : "var(--color-signal)" }}
                  >
                    {you ? "You" : "Sonar"}
                  </span>
                  <span className={you ? "text-legend" : "text-face"}>{s.text}</span>
                </p>
              );
            })
          )}
        </div>

        <div className="flex items-baseline justify-between border-t border-engrave/70 px-5 py-3">
          <span className="legend text-[9.5px] text-legend-dim">Last turn</span>
          <span className="figure text-[13px] text-legend">
            {last ? (
              <>
                <span className={last.ttfa_ms > 900 ? "text-over" : "text-face"}>
                  {Math.round(last.ttfa_ms)} ms
                </span>
                <span className="text-legend-dim">
                  {(last.llm_calls ?? 1) > 1 ? " · used a tool" : " · direct"}
                </span>
              </>
            ) : (
              <span className="text-legend-dim">waiting for a turn</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/** The resting signal: a flat trace, with a slow sweep while the room connects. */
function IdleTrace({ connecting }: { connecting: boolean }) {
  return (
    <div className="relative flex h-full items-center justify-between" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => (
        <span
          key={i}
          className="h-1 w-[6px] rounded-full bg-panel-700"
          style={{
            animation: connecting ? "breathe 1.2s ease-in-out infinite" : "none",
            animationDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}

function MicGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="5.5" y="1.5" width="5" height="8.5" rx="2.5" />
      <path d="M3 8a5 5 0 0 0 10 0M8 13v2" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="currentColor" />
    </svg>
  );
}
