"use client";

import { useState } from "react";
import { useReveal } from "@/lib/useReveal";
import { MEASURED, TOOLS } from "@/lib/types";

/* ── Patch bay ───────────────────────────────────────────────────────────── */

/** The six things it can actually do, as jacks on a patch bay. */
export function PatchBay() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} className="reveal scored" aria-labelledby="patch-heading">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10">
        <h2
          id="patch-heading"
          className="max-w-[22ch] text-[clamp(1.5rem,3.2vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em] text-face"
        >
          It does things, rather than describing them.
        </h2>
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-legend">
          Six tools over a SQLite database, served to the model over MCP. It is told never
          to state a price, subsidy or warranty from memory, so every fact it speaks came
          back through one of these.
        </p>

        <ul className="mt-10 divide-y divide-engrave border-y border-engrave">
          {TOOLS.map((tool) => (
            <li
              key={tool.name}
              className="group grid gap-2 py-4 sm:grid-cols-[minmax(0,20rem)_1fr] sm:gap-8"
            >
              <div className="flex items-center gap-3">
                <Jack />
                <code className="figure text-[13px] text-face">{tool.name}</code>
              </div>
              <p className="text-sm leading-relaxed text-legend">{tool.does}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** A patch-bay jack. Drawn, not an emoji. */
function Jack() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      <circle cx="7" cy="7" r="6" fill="none" stroke="var(--color-engrave)" strokeWidth="1.5" />
      <circle
        cx="7"
        cy="7"
        r="2.4"
        className="fill-engrave transition-colors duration-200 group-hover:fill-[var(--color-signal)]"
      />
    </svg>
  );
}

/* ── Trunk line ──────────────────────────────────────────────────────────── */

type DialState =
  | { kind: "idle" }
  | { kind: "dialing" }
  | { kind: "ringing"; to: string }
  | { kind: "failed"; error: string; hint?: string };

/** The phone path, and the control that makes it ring you. */
export function TrunkLine() {
  const ref = useReveal<HTMLElement>();
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<DialState>({ kind: "idle" });

  async function dial(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "dialing" });
    try {
      const res = await fetch("/api/call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ kind: "failed", error: data.error, hint: data.hint });
        return;
      }
      setStatus({ kind: "ringing", to: data.to });
    } catch {
      setStatus({ kind: "failed", error: "Could not reach the server." });
    }
  }

  return (
    <section ref={ref} className="reveal scored" aria-labelledby="trunk-heading">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:px-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2
            id="trunk-heading"
            className="max-w-[20ch] text-[clamp(1.5rem,3.2vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em] text-face"
          >
            The same agent answers a real phone number.
          </h2>
          <p className="mt-4 max-w-[58ch] text-sm leading-relaxed text-legend">
            A call arrives over a Twilio SIP trunk and LiveKit drops the caller into a room
            as an ordinary participant, so the worker serves the browser and the phone with
            the same code. The only thing that differs is the opening line.
          </p>
          <p className="mt-4 max-w-[58ch] text-sm leading-relaxed text-legend">
            It waits for the line to actually be answered before speaking. An earlier build
            greeted a ringing phone, and the person who picked up heard silence.
          </p>

          <dl className="mt-8 flex gap-10">
            <div>
              <dt className="legend text-[10px] text-legend-dim">Pickup to first word</dt>
              <dd className="figure mt-1.5 text-2xl text-face">
                {(MEASURED.pickupToSpeech.after / 1000).toFixed(2)}
                <span className="ml-1 text-xs text-legend-dim">s</span>
              </dd>
            </div>
            <div>
              <dt className="legend text-[10px] text-legend-dim">Before the fix</dt>
              <dd className="figure mt-1.5 text-2xl text-legend-dim">
                {(MEASURED.pickupToSpeech.before / 1000).toFixed(1)}
                <span className="ml-1 text-xs">s</span>
              </dd>
            </div>
          </dl>
        </div>

        <form onSubmit={dial} className="raised flex flex-col gap-4 rounded-[3px] p-6">
          <div>
            <label htmlFor="dial-to" className="legend block text-[10px] text-legend-dim">
              Phone number
            </label>
            <input
              id="dial-to"
              type="tel"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="+919876543210"
              className="figure mt-2 w-full rounded-[3px] border border-engrave bg-panel-900 px-3 py-2.5 text-sm text-face placeholder:text-legend-dim focus:border-signal focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="dial-why" className="legend block text-[10px] text-legend-dim">
              What it is calling about
            </label>
            <input
              id="dial-why"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="a follow-up about their solar enquiry"
              className="mt-2 w-full rounded-[3px] border border-engrave bg-panel-900 px-3 py-2.5 text-sm text-face placeholder:text-legend-dim focus:border-signal focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={status.kind === "dialing"}
            className="legend raised rounded-[4px] px-5 py-3 text-[12px] text-legend transition-transform duration-150 hover:text-face active:scale-[0.985] disabled:opacity-50"
          >
            {status.kind === "dialing" ? "Dialling" : "Call this number"}
          </button>

          <p aria-live="polite" className="min-h-[2.5rem] text-xs leading-relaxed">
            {status.kind === "ringing" && (
              <span className="text-signal">
                Ringing {status.to}. Answer and it introduces itself.
              </span>
            )}
            {status.kind === "failed" && (
              <span className="text-over">
                {status.error}
                {status.hint ? ` ${status.hint}` : ""}
              </span>
            )}
            {status.kind === "idle" && (
              <span className="text-legend-dim">
                This places a real call and costs real money. The Twilio account is a trial,
                so only numbers verified on it can be reached.
              </span>
            )}
          </p>
        </form>
      </div>
    </section>
  );
}

/* ── Room tone: the honest failure ───────────────────────────────────────── */

/** Where the budget actually goes, including the part that is nobody's fault but physics. */
export function RoomTone() {
  const ref = useReveal<HTMLElement>();
  const worst = Math.max(...MEASURED.rtt.map((r) => r.ms));

  return (
    <section ref={ref} className="reveal scored" aria-labelledby="tone-heading">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10">
        <h2
          id="tone-heading"
          className="max-w-[24ch] text-[clamp(1.5rem,3.2vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em] text-face"
        >
          It misses its target, and the reason is distance.
        </h2>
        <p className="mt-4 max-w-[64ch] text-sm leading-relaxed text-legend">
          Thinking and speaking meet their budgets. Hearing does not. End-of-utterance
          cannot resolve until the final transcript arrives, and the transcript comes from
          the United States while the agent runs in India. Halving the endpointing delay
          moved it by ten milliseconds, which is how the constraint was identified: it was
          never the setting.
        </p>

        <ul className="mt-10 flex flex-col gap-3">
          {MEASURED.rtt.map((r) => (
            <li key={r.provider} className="grid grid-cols-[9rem_1fr_4.5rem] items-center gap-4">
              <span className="legend text-[10px] text-legend-dim">{r.provider}</span>
              <span className="h-[3px] rounded-full bg-panel-800">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${(r.ms / worst) * 100}%`,
                    background:
                      r.ms > 800 ? "var(--color-over)" : "var(--color-signal-dim)",
                  }}
                />
              </span>
              <span className="figure text-right text-[12px] text-legend">{r.ms} ms</span>
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-[64ch] text-sm leading-relaxed text-legend-dim">
          Running the worker beside the providers should put time to first audio near
          730 ms. That is a deployment change, not a code change, and it is the only
          remaining lever of any size.
        </p>
      </div>
    </section>
  );
}

/* ── Colophon ────────────────────────────────────────────────────────────── */

const STACK = [
  ["Transport", "LiveKit · WebRTC and SIP"],
  ["Speech to text", "Deepgram nova-3, streaming"],
  ["Model", "Groq qwen3.8-27b, NVIDIA Nemotron behind it"],
  ["Text to speech", "Cartesia Sonic"],
  ["Tools", "MCP over SQLite"],
  ["Telephony", "Twilio SIP trunk, both directions"],
];

export function Colophon() {
  const ref = useReveal<HTMLElement>();
  return (
    <footer ref={ref} className="reveal scored" aria-labelledby="colophon-heading">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10">
        <h2 id="colophon-heading" className="legend text-[11px] text-legend-dim">
          Built from
        </h2>

        <dl className="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {STACK.map(([k, v]) => (
            <div key={k} className="border-t border-engrave pt-3">
              <dt className="legend text-[9px] text-legend-dim">{k}</dt>
              <dd className="mt-1 text-[13px] text-legend">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-engrave pt-6">
          <a
            href="https://github.com/LaZy-Wolf/Sonar-Voice-Agent"
            className="legend text-[11px] text-legend underline decoration-engrave decoration-1 underline-offset-[6px] transition-colors hover:text-signal hover:decoration-signal"
          >
            Source on GitHub
          </a>
          <span className="figure text-[11px] text-legend-dim">55 tests · CI green</span>
          <span className="text-[11px] text-legend-dim">
            Helios Solar is fiction. The measurements are not.
          </span>
        </div>
      </div>
    </footer>
  );
}
