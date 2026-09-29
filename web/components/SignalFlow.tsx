"use client";

import { useVoiceAssistant } from "@livekit/components-react";
import { LiveReadings } from "@/components/ChannelStrips";
import { Section } from "@/components/Section";
import type { TurnMetrics } from "@/lib/types";

type Node = {
  role: string;
  name: string;
  detail: string;
  /** The agent state during which this stage is the one doing the work. */
  state?: string;
  p50?: number;
  target?: number;
  tools?: boolean;
};

const NODES: Node[] = [
  { role: "Caller", name: "Browser or phone", detail: "WebRTC, or Twilio SIP both ways" },
  { role: "Transport", name: "LiveKit room", detail: "Agent hosted in us-east" },
  { role: "Hear", name: "Deepgram nova-3", detail: "Streaming speech to text", state: "listening", p50: 772, target: 350 },
  { role: "Think", name: "Groq gpt-oss-20b", detail: "Falls back to OpenRouter, then Nemotron", state: "thinking", p50: 312, target: 500, tools: true },
  { role: "Speak", name: "Cartesia Sonic-3", detail: "Streaming text to speech", state: "speaking", p50: 163, target: 150 },
];

/** The pipeline as it runs. While you talk, the stage doing the work is lit. */
export function SignalPath({ live, turns }: { live: boolean; turns: TurnMetrics[] }) {
  const { state } = useVoiceAssistant();

  return (
    <Section
      id="signal"
      index="02 / Signal path"
      title="Five hops between your voice and its answer."
      lede="The browser and the phone both land in the same LiveKit room, so one worker serves both without knowing the difference. Talk to it and the stage doing the work lights up. The figures are p50s from the deployed agent; the stages overlap, so they do not add up to the total."
    >
      <ol className="flex flex-col lg:flex-row lg:items-stretch" aria-label="Pipeline stages">
        {NODES.map((n, i) => {
          const hot = live && n.state === state;
          return (
            <li key={n.role} className="flex flex-col lg:min-w-0 lg:flex-1 lg:flex-row lg:items-center">
              {i > 0 && <Wire index={i} hot={live} />}
              <Stage node={n} hot={hot} />
            </li>
          );
        })}
      </ol>

      <LiveReadings turns={turns} />
    </Section>
  );
}

function Stage({ node, hot }: { node: Node; hot: boolean }) {
  const over = node.p50 !== undefined && node.target !== undefined && node.p50 > node.target;
  return (
    <div className="raised relative flex flex-1 flex-col rounded-[10px] p-4 lg:min-w-0 lg:self-stretch">
      {/* Lit ring. Opacity only, so the stage change never repaints the layout. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[10px] shadow-[0_0_0_1px_var(--color-signal),0_0_32px_-8px_var(--color-signal)] transition-opacity duration-300 ease-[var(--ease-settle)]"
        style={{ opacity: hot ? 1 : 0 }}
      />
      <div className="flex items-center justify-between">
        <span
          className="legend text-[10px] transition-colors duration-300"
          style={{ color: hot ? "var(--color-signal)" : "var(--color-legend-dim)" }}
        >
          {node.role}
        </span>
        {hot && <span className="sr-only">active now</span>}
      </div>
      <p className="mt-3 text-[15px] font-semibold leading-snug text-face">{node.name}</p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-legend-dim">{node.detail}</p>
      {node.tools && (
        <p className="figure mt-3 self-start rounded-[4px] border border-engrave px-2 py-1 text-[11px] text-legend">
          ⇄ 6 MCP tools
        </p>
      )}
      {node.p50 !== undefined && (
        <p className="figure mt-auto pt-5 leading-tight">
          <span className={"block text-[17px] " + (over ? "text-over" : "text-face")}>{node.p50} ms</span>
          <span className="mt-1 block text-[11px] text-legend-dim">p50 · target {node.target}</span>
        </p>
      )}
    </div>
  );
}

/**
 * A connector with a pulse travelling along it, left to right on a wide screen and top
 * to bottom on a narrow one. The pulses are staggered so the path reads as one signal
 * moving through it. Brighter while a call is live.
 */
function Wire({ index, hot }: { index: number; hot: boolean }) {
  return (
    <div
      aria-hidden
      className="relative ml-8 h-9 w-px shrink-0 overflow-hidden bg-engrave lg:ml-0 lg:h-px lg:w-7 xl:w-9"
    >
      <span
        className="absolute inset-0 transition-opacity duration-500 [animation:travel-y_2.4s_cubic-bezier(0.45,0,0.55,1)_infinite] lg:[animation-name:travel-x]"
        style={{ animationDelay: `${index * 480}ms`, opacity: hot ? 1 : 0.45 }}
      >
        <span className="absolute bottom-0 left-0 h-4 w-px bg-gradient-to-b from-transparent to-signal lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:h-px lg:w-5 lg:bg-gradient-to-r" />
      </span>
    </div>
  );
}
