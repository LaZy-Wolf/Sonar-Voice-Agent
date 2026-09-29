"use client";

import { useDataChannel } from "@livekit/components-react";
import { useCallback, useState } from "react";
import type { TurnMetrics } from "@/lib/types";

/**
 * Per-turn latency records the agent publishes on `sonar.metrics`.
 *
 * One subscription for the whole page: the console and the meters both read from it, and
 * a second listener on the same topic would only duplicate the parse.
 */
export function useTurns() {
  const [turns, setTurns] = useState<TurnMetrics[]>([]);

  const onFrame = useCallback((msg: { payload: Uint8Array }) => {
    try {
      const turn = JSON.parse(new TextDecoder().decode(msg.payload)) as TurnMetrics;
      setTurns((prev) => [...prev, turn].slice(-40));
    } catch {
      // A malformed telemetry frame must never take the call down with it.
    }
  }, []);

  useDataChannel("sonar.metrics", onFrame);
  return turns;
}
