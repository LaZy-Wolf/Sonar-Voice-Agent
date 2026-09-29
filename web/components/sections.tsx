"use client";

import { useState } from "react";
import { Section } from "@/components/Section";
import { Mark } from "@/components/TopBar";
import { DECISIONS, MEASURED, REPO, TOOLS } from "@/lib/types";

/* ── Tools ───────────────────────────────────────────────────────────────── */

export function Tools() {
  return (
    <Section
      id="tools"
      index="03 / Tools"
      title="It does things, rather than describing them."
      lede="Six tools over a SQLite database, served to the model over MCP. It is told never to state a price, subsidy or warranty from memory, so every fact it speaks came back through one of these."
    >
      <ol className="grid gap-x-14 sm:grid-cols-2">
        {TOOLS.map((tool, i) => (
          <li key={tool.name} className="group border-t border-engrave py-7">
            <div className="flex items-baseline gap-4">
              <span className="figure w-5 shrink-0 text-[11px] text-legend-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
              <code className="figure text-[14px] text-face transition-colors duration-200 group-hover:text-signal">
                {tool.name}
              </code>
            </div>
            <p className="mt-3 pl-9 text-[15px] leading-relaxed text-legend">{tool.does}</p>
            <p className="mt-3 pl-9 text-[14px] leading-relaxed text-legend-dim">
              <span className="legend mr-2 text-[9.5px]">Try</span>
              &ldquo;{tool.try}&rdquo;
            </p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ── Phone ───────────────────────────────────────────────────────────────── */

const CALL_STATES = ["dialing", "ringing", "active", "greeting"] as const;

export function Phone({ dialOut }: { dialOut: boolean }) {
  const { before, after } = MEASURED.pickupToSpeech;
  return (
    <Section
      id="phone"
      index="04 / Phone"
      title="The same agent answers a real phone number."
      lede="A call arrives over a Twilio SIP trunk and LiveKit drops the caller into a room as an ordinary participant. An earlier build greeted a ringing phone, so the person who picked up heard silence. It now waits for the line to be answered, and speaks a fixed greeting instead of composing one."
    >
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-16">
        <div>
          <h3 className="legend text-[10px] text-legend-dim">Silence after pickup</h3>
          <div className="mt-5 flex flex-col gap-5">
            <Bar label="Before the fix" value={before} max={before} tone="dim" />
            <Bar label="Now" value={after} max={before} tone="signal" />
          </div>

          <h3 className="legend mt-12 text-[10px] text-legend-dim">
            What it waits for, from <code className="figure normal-case tracking-normal">sip.callStatus</code>
          </h3>
          <ol className="mt-4 flex flex-wrap items-center gap-2">
            {CALL_STATES.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                {i > 0 && (
                  <span aria-hidden className="text-legend-dim">
                    →
                  </span>
                )}
                <span
                  className={
                    "figure rounded-[5px] border px-2.5 py-1.5 text-[12px] " +
                    (s === "active" ? "border-face/60 text-face" : "border-engrave text-legend")
                  }
                >
                  {s}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {dialOut ? (
          <DialForm />
        ) : (
          <div className="raised self-start rounded-[10px] p-6">
            <h3 className="text-[16px] font-semibold text-face">Dial-out is off on this page</h3>
            <p className="mt-3 text-[14px] leading-relaxed text-legend">
              Placing a call costs real money, so the public deployment cannot ring anyone.
              The Twilio account is a trial, which also limits inbound calls to verified
              numbers.
            </p>
            <a
              href={`${REPO}/blob/main/scripts/setup_sip.py`}
              className="group mt-5 inline-flex items-center gap-1.5 text-[14px] text-legend transition-colors hover:text-face"
            >
              How the trunks are wired
              <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
                →
              </span>
            </a>
          </div>
        )}
      </div>
    </Section>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: "dim" | "signal" }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-legend">{label}</span>
        <span className={"figure " + (tone === "signal" ? "text-face" : "text-legend-dim")}>
          {(value / 1000).toFixed(value < 2000 ? 2 : 1)} s
        </span>
      </div>
      <div className="well mt-2 h-2.5 overflow-hidden rounded-full">
        <div
          className="bar-fill h-full rounded-full"
          style={{
            width: `${(value / max) * 100}%`,
            background: tone === "signal" ? "var(--color-signal)" : "var(--color-engrave)",
          }}
        />
      </div>
    </div>
  );
}

type DialState =
  | { kind: "idle" }
  | { kind: "dialing" }
  | { kind: "ringing"; to: string }
  | { kind: "failed"; error: string; hint?: string };

/** Only rendered where DIAL_OUT_ENABLED=1, which is never the public deployment. */
function DialForm() {
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

  const field =
    "mt-2 w-full rounded-[6px] border border-engrave bg-panel-950 px-3 py-2.5 text-[14px] text-face placeholder:text-legend-dim transition-colors focus:border-signal focus:outline-none";

  return (
    <form onSubmit={dial} className="raised flex flex-col gap-4 self-start rounded-[10px] p-6">
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
          className={"figure " + field}
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
          className={field}
        />
      </div>
      <button
        type="submit"
        disabled={status.kind === "dialing"}
        className="legend min-h-11 rounded-[6px] bg-signal px-5 text-[12px] text-panel-900 transition-[transform,background-color] duration-200 hover:bg-face active:scale-[0.97] disabled:opacity-50"
      >
        {status.kind === "dialing" ? "Dialling" : "Call this number"}
      </button>
      <p aria-live="polite" className="min-h-10 text-[13px] leading-relaxed">
        {status.kind === "ringing" && (
          <span className="text-signal">Ringing {status.to}. Answer and it introduces itself.</span>
        )}
        {status.kind === "failed" && (
          <span className="text-over">
            {status.error}
            {status.hint ? ` ${status.hint}` : ""}
          </span>
        )}
        {status.kind === "idle" && (
          <span className="text-legend-dim">This places a real call and costs real money.</span>
        )}
      </p>
    </form>
  );
}

/* ── Latency ─────────────────────────────────────────────────────────────── */

export function Latency() {
  const scale = 900;
  return (
    <Section
      id="latency"
      index="05 / Latency"
      title="It misses its target, and says so."
      lede={`Time to first audio is ${MEASURED.browser.p50} ms at p50 against a 900 ms budget, timed by LiveKit from the moment you stop speaking to the agent's first sound. Thinking is inside its budget, and transcribing and speaking are within 15 ms of theirs. Hearing, deciding that you have finished, misses by more than 400 ms.`}
    >
      <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <ul className="flex flex-col gap-7">
            {MEASURED.stages.map((s) => {
              const over = s.p50 > s.target;
              return (
                <li key={s.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)_4.5rem] items-center gap-4 sm:grid-cols-[9rem_minmax(0,1fr)_5rem]">
                  <div>
                    <p className="text-[14px] text-face">{s.label}</p>
                    <p className="text-[12px] text-legend-dim">{s.note}</p>
                  </div>
                  <div className="well relative h-2.5 rounded-full">
                    <div
                      className="bar-fill absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.min(100, (s.p50 / scale) * 100)}%`,
                        background: over ? "var(--color-over)" : "var(--color-signal-dim)",
                      }}
                    />
                    <span
                      aria-hidden
                      title={`target ${s.target} ms`}
                      className="absolute -top-1.5 h-[22px] w-0.5 rounded-full bg-face"
                      style={{ left: `${(s.target / scale) * 100}%` }}
                    />
                  </div>
                  <p className="figure text-right text-[13px]">
                    <span className={over ? "text-over" : "text-face"}>{s.p50}</span>
                    <span className="text-legend-dim"> ms</span>
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-8 flex items-center gap-2 text-[12px] text-legend-dim">
            <span aria-hidden className="h-3.5 w-0.5 rounded-full bg-face" />
            Stage target. Bars are p50s over five turns on the deployed agent.
          </p>
        </div>

        <div>
          <h3 className="text-[16px] font-semibold text-face">Moving closer did not fix hearing</h3>
          <p className="mt-3 text-[14px] leading-relaxed text-legend">
            With the agent on a laptop in India and every provider in the United States,
            distance looked like the cause. Moved to us-east, beside them:
          </p>
          <table className="mt-5 w-full text-[13px]">
            <caption className="sr-only">Stage p50s before and after moving the agent to us-east</caption>
            <thead>
              <tr className="text-left">
                <th className="legend pb-2 text-[9.5px] font-semibold text-legend-dim">Stage</th>
                <th className="legend pb-2 text-right text-[9.5px] font-semibold text-legend-dim">India</th>
                <th className="legend pb-2 text-right text-[9.5px] font-semibold text-legend-dim">us-east</th>
              </tr>
            </thead>
            <tbody className="figure">
              {MEASURED.moved.map((r) => (
                <tr key={r.label} className="border-t border-engrave">
                  <td className="py-2.5 font-[family-name:var(--font-body)] text-legend">{r.label}</td>
                  <td className="py-2.5 text-right text-legend-dim">{r.india}</td>
                  <td className={"py-2.5 text-right " + (r.usEast > r.india ? "text-over" : "text-face")}>
                    {r.usEast}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-5 text-[14px] leading-relaxed text-legend">
            Transcription got three times faster. Hearing got slower. The cause is still open.
          </p>
          <a
            href={`${REPO}#measured-latency`}
            className="group mt-5 inline-flex items-center gap-1.5 text-[14px] text-legend transition-colors hover:text-face"
          >
            All the numbers
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">
              →
            </span>
          </a>
        </div>
      </div>
    </Section>
  );
}

/* ── Build log ───────────────────────────────────────────────────────────── */

const ENTRIES = [
  {
    title: "The planned model was demoted on measurement.",
    body: "Nemotron was meant to be the brain. On NVIDIA's free tier it had a 597 ms median but a 5.2 s worst case, and timed out on the call that carries a tool result back. Groq now leads and Nemotron is the last fallback.",
  },
  {
    title: "Outbound calls greeted a ringing line.",
    body: "The person who picked up heard nothing. The agent now waits for the SIP status to go active. Starting the voice session during the ring crashed the worker natively, so it starts after the answer.",
  },
  {
    title: "Moving beside the providers did not fix hearing.",
    body: "Deploying to us-east made the model and transcription faster and end-of-utterance slower, 634 to 772 ms. The prediction of about 730 ms total was wrong, and the README says so.",
  },
  {
    title: "The latency metric itself was wrong.",
    body: "Adding the stages together overstated direct turns by up to 360 ms and understated tool turns by up to 210 ms, because the model starts before the turn is called. It now records LiveKit's end-to-end timing.",
  },
  {
    title: "A failover tier that could not route.",
    body: "Forcing Groq to fail showed every OpenRouter request returning 404 over one parameter name. After the fix, the Groq budget was drained on purpose in production: a real 429, a switch, and a correct answer.",
  },
];

export function Decisions() {
  return (
    <Section
      id="log"
      index="06 / Build log"
      title="What the build got wrong, and what fixed it."
      lede="Every change is recorded with the measurement that caused it, including the hypotheses that turned out to be wrong."
    >
      <ol>
        {ENTRIES.map((e, i) => (
          <li
            key={e.title}
            className="grid gap-3 border-t border-engrave py-8 lg:grid-cols-[9rem_minmax(0,22rem)_minmax(0,1fr)] lg:gap-10"
          >
            <span className="figure text-[12px] text-legend-dim">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="text-[18px] font-semibold leading-snug tracking-[-0.01em] text-face">{e.title}</h3>
            <p className="max-w-[60ch] text-[15px] leading-relaxed text-legend">{e.body}</p>
          </li>
        ))}
      </ol>
      <a
        href={DECISIONS}
        className="group mt-6 inline-flex min-h-11 items-center gap-2 text-[15px] text-face transition-colors hover:text-signal lg:ml-[calc(9rem+2.5rem)]"
      >
        Read the full decisions log
        <span aria-hidden className="transition-transform duration-200 ease-[var(--ease-settle)] group-hover:translate-x-1">
          →
        </span>
      </a>
    </Section>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────────── */

const STACK = [
  ["Transport", "LiveKit, WebRTC and SIP"],
  ["Speech to text", "Deepgram nova-3, streaming"],
  ["Model", "Groq gpt-oss-20b, then OpenRouter, then Nemotron"],
  ["Text to speech", "Cartesia Sonic-3"],
  ["Tools", "MCP over SQLite"],
  ["Web", "Next.js, React, Tailwind CSS"],
];

export function Footer() {
  return (
    <footer className="scored bg-panel-950">
      <div className="mx-auto w-full max-w-6xl px-6 pb-12 pt-16 sm:px-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div>
            <div className="flex items-center gap-2.5 text-face">
              <Mark size={26} />
              <span className="text-[18px] font-semibold tracking-[-0.01em]">Sonar</span>
            </div>
            <p className="mt-4 max-w-[34ch] text-[14px] leading-relaxed text-legend-dim">
              A real-time voice agent. Helios Solar is fiction. The measurements are not.
            </p>
          </div>

          <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {STACK.map(([k, v]) => (
              <div key={k} className="border-t border-engrave pt-3">
                <dt className="legend text-[9.5px] text-legend-dim">{k}</dt>
                <dd className="mt-1.5 text-[13px] leading-snug text-legend">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-engrave pt-6 text-[13px]">
          <a href={REPO} className="text-legend transition-colors hover:text-face">
            Source on GitHub
          </a>
          <a href={DECISIONS} className="text-legend transition-colors hover:text-face">
            Decisions log
          </a>
          <a href={`${REPO}#measured-latency`} className="text-legend transition-colors hover:text-face">
            Measured latency
          </a>
          <span className="figure text-[12px] text-legend-dim">59 tests · CI green</span>
          <span className="text-legend-dim sm:ml-auto">
            Built by{" "}
            <a href="https://github.com/LaZy-Wolf" className="text-legend underline decoration-engrave underline-offset-4 transition-colors hover:text-face hover:decoration-signal">
              LaZy-Wolf
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
