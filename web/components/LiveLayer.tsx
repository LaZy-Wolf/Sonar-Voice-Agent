"use client";

import {
  BarVisualizer,
  RoomAudioRenderer,
  RoomContext,
  StartAudio,
  useDataChannel,
  useRoomContext,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import { ConnectionState, Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Line, TurnMetrics } from "@/lib/types";

export type LiveProps = {
  micMuted: boolean;
  /** Where the audio visualizer is drawn, inside the console. */
  vizTarget: HTMLElement | null;
  onConnected: () => void;
  onEnded: () => void;
  onError: (message: string) => void;
  onAgentState: (state: string) => void;
  onLines: (lines: Line[]) => void;
  onTurn: (turn: TurnMetrics) => void;
};

/**
 * Everything that needs LiveKit, loaded only when someone presses Start talking.
 *
 * The LiveKit client is most of the page's JavaScript. Keeping it out of the first load
 * lets the page paint and settle on a phone before any of it is fetched; this layer then
 * connects, and reports state, transcript and metrics back up to the static page.
 */
export default function LiveLayer(props: LiveProps) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  // Latest callbacks without re-running the connect effect when a parent re-renders.
  const cb = useRef(props);
  useEffect(() => {
    cb.current = props;
  });

  useEffect(() => {
    let cancelled = false;
    const onState = (s: ConnectionState) => {
      if (s === ConnectionState.Disconnected && !cancelled) cb.current.onEnded();
    };
    room.on(RoomEvent.ConnectionStateChanged, onState);

    (async () => {
      try {
        const res = await fetch("/api/token");
        if (!res.ok) throw new Error("Could not get a token from the server.");
        const { token, url } = (await res.json()) as { token: string; url: string };
        await room.connect(url, token);
        if (cancelled) return;
        await room.localParticipant.setMicrophoneEnabled(true);
        if (!cancelled) cb.current.onConnected();
      } catch (e) {
        if (cancelled) return;
        cb.current.onError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Microphone access was blocked. Allow it in your browser and try again."
            : "Could not start the call. Check your connection and try again.",
        );
      }
    })();

    return () => {
      cancelled = true;
      room.off(RoomEvent.ConnectionStateChanged, onState);
      room.disconnect();
    };
  }, [room]);

  useEffect(() => {
    if (room.state === ConnectionState.Connected) {
      room.localParticipant.setMicrophoneEnabled(!props.micMuted).catch(() => {});
    }
  }, [room, props.micMuted]);

  return (
    <RoomContext.Provider value={room}>
      {/* Without this the agent is connected but inaudible. */}
      <RoomAudioRenderer />
      <StartAudio label="Tap to enable audio" className="sr-only" />
      <Reporters
        onAgentState={props.onAgentState}
        onLines={props.onLines}
        onTurn={props.onTurn}
      />
      {props.vizTarget && createPortal(<Visualizer />, props.vizTarget)}
    </RoomContext.Provider>
  );
}

/** Reads room state and hands it up. Its callbacks are stable setters from the page. */
function Reporters({
  onAgentState,
  onLines,
  onTurn,
}: Pick<LiveProps, "onAgentState" | "onLines" | "onTurn">) {
  const { state } = useVoiceAssistant();
  const segments = useTranscriptions();
  const room = useRoomContext();

  useEffect(() => {
    onAgentState(state);
  }, [onAgentState, state]);

  useEffect(() => {
    const me = room.localParticipant.identity;
    onLines(
      segments.slice(-6).map((s) => ({
        id: s.streamInfo.id,
        you: s.participantInfo.identity === me,
        text: s.text,
      })),
    );
  }, [onLines, segments, room]);

  const onFrame = useCallback(
    (msg: { payload: Uint8Array }) => {
      try {
        onTurn(JSON.parse(new TextDecoder().decode(msg.payload)) as TurnMetrics);
      } catch {
        // A malformed telemetry frame must never take the call down with it.
      }
    },
    [onTurn],
  );
  useDataChannel("sonar.metrics", onFrame);

  return null;
}

function Visualizer() {
  const { state, audioTrack } = useVoiceAssistant();
  return (
    <BarVisualizer
      state={state}
      barCount={28}
      trackRef={audioTrack}
      options={{ minHeight: 4 }}
      className="flex h-full w-full items-center justify-between [&>span]:w-[6px] [&>span]:rounded-full [&>span]:bg-panel-700 [&>span]:transition-colors [&>span[data-lk-highlighted=true]]:bg-signal"
    />
  );
}
