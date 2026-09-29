"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { MasterSection } from "@/components/MasterSection";
import { Decisions, Footer, Latency, Phone, Tools } from "@/components/sections";
import { SignalPath } from "@/components/SignalFlow";
import { TopBar } from "@/components/TopBar";
import type { Line, Session, TurnMetrics } from "@/lib/types";

// The LiveKit client is most of the page's JavaScript and nothing needs it until a call
// starts, so it is fetched on intent (hover or focus on Start talking) or on the click.
const loadLive = () => import("@/components/LiveLayer");
const LiveLayer = dynamic(loadLive, { ssr: false });

export function Desk({ dialOut }: { dialOut: boolean }) {
  const [session, setSession] = useState<Session>("idle");
  const [agentState, setAgentState] = useState("disconnected");
  const [lines, setLines] = useState<Line[]>([]);
  const [turns, setTurns] = useState<TurnMetrics[]>([]);
  const [micMuted, setMicMuted] = useState(false);
  const [error, setError] = useState<string>();
  const [vizTarget, setVizTarget] = useState<HTMLDivElement | null>(null);

  const start = useCallback(() => {
    setError(undefined);
    setMicMuted(false);
    setSession("connecting");
  }, []);

  const end = useCallback(() => {
    setSession("idle");
    setAgentState("disconnected");
  }, []);

  const fail = useCallback((message: string) => {
    setError(message);
    setSession("idle");
    setAgentState("disconnected");
  }, []);

  const addTurn = useCallback(
    (turn: TurnMetrics) => setTurns((prev) => [...prev, turn].slice(-40)),
    [],
  );

  const live = session === "live";

  return (
    <>
      <a
        href="#main"
        className="legend sr-only z-50 rounded-[4px] bg-signal px-4 py-2 text-[11px] text-panel-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <TopBar live={live} />
      <main id="main">
        <MasterSection
          session={session}
          agentState={agentState}
          lines={lines}
          turns={turns}
          micMuted={micMuted}
          error={error}
          onStart={start}
          onEnd={end}
          onToggleMic={() => setMicMuted((m) => !m)}
          onIntent={loadLive}
          vizRef={setVizTarget}
        />
        <SignalPath live={live} agentState={agentState} turns={turns} />
        <Tools />
        <Phone dialOut={dialOut} />
        <Latency />
        <Decisions />
      </main>
      <Footer />

      {session !== "idle" && (
        <LiveLayer
          micMuted={micMuted}
          vizTarget={vizTarget}
          onConnected={() => setSession("live")}
          onEnded={end}
          onError={fail}
          onAgentState={setAgentState}
          onLines={setLines}
          onTurn={addTurn}
        />
      )}
    </>
  );
}
