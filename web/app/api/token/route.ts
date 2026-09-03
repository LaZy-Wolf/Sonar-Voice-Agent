import { AccessToken } from "livekit-server-sdk";
import { NextResponse } from "next/server";

// Each visitor gets their own room, so two people trying the demo at once do not
// end up in the same call. The agent joins any new room in the project.
// Route Handlers are uncached by default in Next 16, so no dynamic config is needed.

export async function GET() {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return NextResponse.json(
      { error: "LiveKit is not configured on the server." },
      { status: 500 },
    );
  }

  const suffix = Math.random().toString(36).slice(2, 10);
  const room = `sonar-web-${suffix}`;

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `caller-${suffix}`,
    ttl: "15m",
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  // The secret signs the token here and never leaves the server.
  return NextResponse.json({ token: await at.toJwt(), url: LIVEKIT_URL, room });
}
