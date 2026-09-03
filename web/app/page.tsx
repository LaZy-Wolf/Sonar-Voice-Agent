"use client";

import { RoomAudioRenderer, RoomContext, StartAudio } from "@livekit/components-react";
import { ConnectionState, Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CallPanel } from "@/components/CallPanel";
import { LatencyHud } from "@/components/LatencyHud";
import { Transcript } from "@/components/Transcript";

export default function Home() {
  const room = useMemo(() => new Room({ adaptiveStream: true, dynacast: true }), []);
  const [connection, setConnection] = useState<ConnectionState | "connecting">(
    ConnectionState.Disconnected,
  );
  const [micMuted, setMicMuted] = useState(false);
  const [agentIdentity, setAgentIdentity] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const onState = (s: ConnectionState) => setConnection(s);
    const onJoin = (p: { identity: string }) => setAgentIdentity(p.identity);
    room.on(RoomEvent.ConnectionStateChanged, onState);
    room.on(RoomEvent.ParticipantConnected, onJoin);
    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onState);
      room.off(RoomEvent.ParticipantConnected, onJoin);
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
      // Publishing the mic is what triggers the browser permission prompt, so it has
      // to happen inside the click handler to count as a user gesture.
      await room.localParticipant.setMicrophoneEnabled(true);
      setMicMuted(false);
    } catch (e) {
      setConnection(ConnectionState.Disconnected);
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it and try again."
          : "Could not start the call. Check that the agent worker is running.",
      );
    }
  }, [room]);

  const end = useCallback(() => {
    room.disconnect();
    setAgentIdentity(undefined);
  }, [room]);

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

      <main className="mx-auto grid min-h-dvh max-w-6xl grid-cols-1 lg:grid-cols-[1.1fr_1fr]">
        <div className="border-ink-850 lg:border-r">
          <CallPanel
            connection={connection}
            micMuted={micMuted}
            onStart={start}
            onEnd={end}
            onToggleMic={toggleMic}
            error={error}
          />
        </div>

        <div className="flex min-h-0 flex-col divide-y divide-ink-850 border-t border-ink-850 lg:border-t-0">
          <LatencyHud />
          <Transcript agentIdentity={agentIdentity} />
        </div>
      </main>
    </RoomContext.Provider>
  );
}
