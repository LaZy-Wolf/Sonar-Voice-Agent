"use client";

import { RoomAudioRenderer, RoomContext, StartAudio } from "@livekit/components-react";
import { ConnectionState, Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MasterSection } from "@/components/MasterSection";
import { Decisions, Footer, Latency, Phone, Tools } from "@/components/sections";
import { SignalPath } from "@/components/SignalFlow";
import { TopBar } from "@/components/TopBar";
import { useTurns } from "@/lib/useTurns";

export function Desk({ dialOut }: { dialOut: boolean }) {
  const room = useMemo(() => new Room({ adaptiveStream: true, dynacast: true }), []);
  const [connection, setConnection] = useState<ConnectionState | "connecting">(
    ConnectionState.Disconnected,
  );
  const [micMuted, setMicMuted] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const onState = (s: ConnectionState) => setConnection(s);
    room.on(RoomEvent.ConnectionStateChanged, onState);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onState);
      room.disconnect();
    };
  }, [room]);

  const start = useCallback(async () => {
    setError(undefined);
    setConnection("connecting");
    try {
      const res = await fetch("/api/token");
      if (!res.ok) throw new Error("Could not get a token from the server.");
      const { token, url } = (await res.json()) as { token: string; url: string };
      await room.connect(url, token);
      // Publishing the mic is what triggers the permission prompt, so it has to happen
      // inside the click handler to count as a user gesture.
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicMuted(false);
    } catch (e) {
      room.disconnect();
      setConnection(ConnectionState.Disconnected);
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser and try again."
          : "Could not start the call. Check your connection and try again.",
      );
    }
  }, [room]);

  const end = useCallback(() => room.disconnect(), [room]);

  const toggleMic = useCallback(async () => {
    const next = !micMuted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMicMuted(next);
  }, [room, micMuted]);

  return (
    <RoomContext.Provider value={room}>
      {/* Without this the agent is connected but inaudible. */}
      <RoomAudioRenderer />
      <StartAudio label="Tap to enable audio" className="sr-only" />
      <Body
        live={connection === ConnectionState.Connected}
        connection={connection}
        micMuted={micMuted}
        onStart={start}
        onEnd={end}
        onToggleMic={toggleMic}
        error={error}
        dialOut={dialOut}
      />
    </RoomContext.Provider>
  );
}

/** Everything that reads room data, so it sits inside the RoomContext provider. */
function Body({
  live,
  dialOut,
  ...console
}: Omit<React.ComponentProps<typeof MasterSection>, "turns"> & {
  live: boolean;
  dialOut: boolean;
}) {
  const turns = useTurns();
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
        <MasterSection {...console} turns={turns} />
        <SignalPath live={live} turns={turns} />
        <Tools />
        <Phone dialOut={dialOut} />
        <Latency />
        <Decisions />
      </main>
      <Footer />
    </>
  );
}
