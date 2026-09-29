"use client";

import { useEffect, useState } from "react";
import { REPO } from "@/lib/types";

const NAV = [
  ["signal", "Signal path"],
  ["tools", "Tools"],
  ["phone", "Phone"],
  ["latency", "Latency"],
  ["log", "Build log"],
] as const;

/** One line: what this is, where you are on the page, and the way to the source. */
export function TopBar({ live }: { live: boolean }) {
  const [active, setActive] = useState<string>();

  useEffect(() => {
    // A section counts as current when it crosses the middle band of the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    for (const [id] of NAV) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    const top = document.getElementById("console");
    if (top) io.observe(top);
    return () => io.disconnect();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-engrave/80 bg-panel-900/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-8 px-6 sm:px-10">
        <a href="#console" className="flex items-center gap-2.5 text-face" aria-label="Sonar, back to top">
          <Mark />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Sonar</span>
        </a>

        <nav aria-label="Sections" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={active === id ? "true" : undefined}
                  className="relative block rounded-[4px] px-3 py-1.5 text-[13px] text-legend-dim transition-colors duration-200 hover:text-face aria-[current=true]:text-face after:absolute after:inset-x-3 after:-bottom-[12px] after:h-px after:bg-signal after:opacity-0 after:transition-opacity after:duration-300 aria-[current=true]:after:opacity-100"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-5">
          <span className="hidden items-center gap-2 sm:flex">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full transition-colors duration-300"
              style={{
                background: live ? "var(--color-signal)" : "var(--color-engrave)",
                boxShadow: live ? "0 0 10px 1px oklch(78% 0.15 68 / 0.55)" : "none",
                animation: live ? "breathe 2.4s ease-in-out infinite" : "none",
              }}
            />
            <span className="legend text-[10px] text-legend-dim">{live ? "On air" : "Standby"}</span>
          </span>
          <a
            href={REPO}
            className="raised flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-[13px] text-legend transition-colors duration-200 hover:text-face active:translate-y-px"
          >
            <GitHubMark />
            Source
          </a>
        </div>
      </div>
    </header>
  );
}

/** A ping and its first two returns. */
export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="6" cy="12" r="2.6" fill="var(--color-signal)" />
      <path d="M11 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.5 3a13 13 0 0 1 0 18" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
