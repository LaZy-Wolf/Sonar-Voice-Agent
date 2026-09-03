import { RoomServiceClient, SipClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";

/**
 * Place an outbound call: create the room, tell the agent why it is calling, then dial.
 *
 * Order matters. The room and its metadata must exist before the callee picks up, or
 * the agent joins with no idea who it rang or what for and opens with nothing.
 */
export async function POST(request: Request) {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, SONAR_OUTBOUND_TRUNK_ID } =
    process.env;

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return NextResponse.json({ error: "LiveKit is not configured." }, { status: 500 });
  }
  if (!SONAR_OUTBOUND_TRUNK_ID) {
    return NextResponse.json(
      { error: "No outbound trunk. Run `make sip` and set SONAR_OUTBOUND_TRUNK_ID." },
      { status: 500 },
    );
  }

  let body: { to?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  // E.164 only. Twilio rejects anything else, and a clear message here beats a SIP
  // error surfacing thirty seconds later as a call that silently never connects.
  const to = (body.to ?? "").replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(to)) {
    return NextResponse.json(
      { error: "Number must be in E.164 format, for example +919876543210." },
      { status: 400 },
    );
  }

  const reason = (body.reason ?? "a follow-up about their solar enquiry").slice(0, 300);
  const httpUrl = LIVEKIT_URL.replace(/^wss?:\/\//, "https://");
  const room = `sonar-out-${Date.now().toString(36)}`;

  try {
    const rooms = new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    // The agent reads this on connect to decide it is calling out, and what to say.
    await rooms.createRoom({
      name: room,
      metadata: JSON.stringify({ phone_number: to, reason }),
      emptyTimeout: 120,
    });

    const sip = new SipClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    const participant = await sip.createSipParticipant(SONAR_OUTBOUND_TRUNK_ID, to, room, {
      participantIdentity: `callee-${to}`,
      participantName: to,
      playDialtone: false,
      // Return as soon as it is ringing. Blocking until answer would hold the request
      // open for the length of a phone call.
      waitUntilAnswered: false,
    });

    return NextResponse.json({ room, to, participant: participant.participantIdentity });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown error";
    // A Twilio trial account can only dial numbers verified in its console; that is
    // by far the most common reason for this to fail, so say so.
    return NextResponse.json(
      {
        error: `Could not place the call: ${detail}`,
        hint: "On a Twilio trial account the destination must be a verified number.",
      },
      { status: 502 },
    );
  }
}
