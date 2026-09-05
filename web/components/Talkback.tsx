"use client";

import { useTranscriptions } from "@livekit/components-react";
import { useEffect, useRef } from "react";
import { useReveal } from "@/lib/useReveal";

/** The talkback log: what was said, both directions. */
export function Talkback({ agentIdentity }: { agentIdentity?: string }) {
  const segments = useTranscriptions();
  const endRef = useRef<HTMLDivElement>(null);
  const ref = useReveal<HTMLElement>();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [segments.length]);

  return (
    <section ref={ref} className="reveal scored" aria-labelledby="talkback-heading">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:px-10">
        <h2
          id="talkback-heading"
          className="text-[clamp(1.5rem,3.2vw,2.25rem)] font-semibold leading-tight tracking-[-0.02em] text-face"
        >
          Talkback
        </h2>

        <div className="raised mt-8 max-h-[26rem] overflow-y-auto rounded-[3px] p-6">
          {segments.length === 0 ? (
            <p className="max-w-[58ch] text-sm leading-relaxed text-legend-dim">
              Nothing said yet. Try asking how long the panel warranty is, what a five
              kilowatt system costs, or which cities Helios serves. Then try booking a site
              visit and watch it refuse a slot that clashes.
            </p>
          ) : (
            <ol className="flex flex-col gap-5">
              {segments.map((s) => {
                const fromAgent =
                  agentIdentity !== undefined &&
                  s.participantInfo.identity === agentIdentity;
                return (
                  <li key={s.streamInfo.id} className="text-[15px] leading-relaxed">
                    <span
                      className="legend mb-1 block text-[9px]"
                      style={{
                        color: fromAgent ? "var(--color-signal)" : "var(--color-legend-dim)",
                      }}
                    >
                      {fromAgent ? "Sonar" : "You"}
                    </span>
                    <span className={fromAgent ? "text-face" : "text-legend"}>{s.text}</span>
                  </li>
                );
              })}
              <div ref={endRef} />
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
