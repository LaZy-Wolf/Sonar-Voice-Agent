"use client";

import { useTranscriptions } from "@livekit/components-react";
import { useEffect, useRef } from "react";

/** Running transcript of both sides, newest at the bottom. */
export function Transcript({ agentIdentity }: { agentIdentity?: string }) {
  const segments = useTranscriptions();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments.length]);

  return (
    <section aria-labelledby="transcript-heading" className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-ink-850 px-5 py-4">
        <h2 id="transcript-heading" className="text-sm font-medium text-ink-200">
          Transcript
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {segments.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-600">
            Nothing said yet. Ask about panel warranties, system prices, subsidies, or
            book a site visit.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {segments.map((s) => {
              const fromAgent =
                agentIdentity !== undefined &&
                s.participantInfo.identity === agentIdentity;
              return (
                <li key={s.streamInfo.id} className="rise text-sm leading-relaxed">
                  <span
                    className={
                      fromAgent
                        ? "mb-0.5 block text-xs font-medium text-solar-400"
                        : "mb-0.5 block text-xs font-medium text-ink-600"
                    }
                  >
                    {fromAgent ? "Sonar" : "You"}
                  </span>
                  <span className={fromAgent ? "text-ink-200" : "text-ink-400"}>
                    {s.text}
                  </span>
                </li>
              );
            })}
            <div ref={endRef} />
          </ol>
        )}
      </div>
    </section>
  );
}
