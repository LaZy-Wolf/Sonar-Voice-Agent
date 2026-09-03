"use client";

import { useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "dialing" }
  | { kind: "ringing"; to: string }
  | { kind: "failed"; error: string; hint?: string };

/** Ask the agent to phone someone. */
export function DialOut() {
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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
    <section aria-labelledby="dial-heading" className="shrink-0">
      <header className="border-b border-ink-850 px-5 py-4">
        <h2 id="dial-heading" className="text-sm font-medium text-ink-200">
          Have it call you
        </h2>
      </header>

      <form onSubmit={dial} className="flex flex-col gap-3 px-5 py-4">
        <div>
          <label htmlFor="dial-to" className="block text-xs text-ink-600">
            Phone number
          </label>
          <input
            id="dial-to"
            type="tel"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="+919876543210"
            className="mt-1 w-full rounded-md border border-ink-800 bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-solar-500 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="dial-reason" className="block text-xs text-ink-600">
            What is it calling about
          </label>
          <input
            id="dial-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="a follow-up about their solar enquiry"
            className="mt-1 w-full rounded-md border border-ink-800 bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600 focus:border-solar-500 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={status.kind === "dialing"}
          className="rounded-lg border border-ink-800 px-4 py-2.5 text-sm font-medium text-ink-200 transition-colors duration-150 hover:bg-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solar-400 active:scale-[0.99] disabled:opacity-50"
        >
          {status.kind === "dialing" ? "Dialing" : "Call this number"}
        </button>

        <p aria-live="polite" className="text-xs leading-relaxed">
          {status.kind === "ringing" && (
            <span className="text-[var(--color-under)]">
              Ringing {status.to}. Answer and Sonar will introduce itself.
            </span>
          )}
          {status.kind === "failed" && (
            <span className="text-[var(--color-over)]">
              {status.error}
              {status.hint ? ` ${status.hint}` : ""}
            </span>
          )}
          {status.kind === "idle" && (
            <span className="text-ink-600">
              Sonar rings your phone and starts the conversation itself.
            </span>
          )}
        </p>
      </form>
    </section>
  );
}
