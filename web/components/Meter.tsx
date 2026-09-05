"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  label: string;
  /** Milliseconds for this stage, or null before any turn has been measured. */
  value: number | null;
  /** The stage's p50 target. Engraved on the same scale as the live value. */
  target: number;
  /** Full-scale deflection, in ms. */
  full: number;
};

const RISE = 0.34; // needle catches a rising value quickly
const FALL = 0.08; // and settles back slowly, the way a real movement does
const PEAK_DECAY = 0.985;

/**
 * A meter with genuine ballistics: fast rise, slow fall, a peak-hold marker that decays.
 *
 * The target is engraved on the same scale as the live value, so a stage over budget
 * reads as a needle past the mark before anyone parses a number. This is the page's one
 * authored motion; everything else just settles into place.
 */
export function Meter({ label, value, target, full }: Props) {
  const [angle, setAngle] = useState(0);
  const [peak, setPeak] = useState(0);
  const raf = useRef(0);
  const state = useRef({ current: 0, peak: 0, goal: 0 });

  useEffect(() => {
    state.current.goal = value === null ? 0 : Math.min(1, value / full);
  }, [value, full]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setAngle(state.current.goal);
      setPeak(state.current.goal);
      return;
    }

    const tick = () => {
      const s = state.current;
      const k = s.goal > s.current ? RISE : FALL;
      s.current += (s.goal - s.current) * k;
      s.peak = Math.max(s.peak * PEAK_DECAY, s.current);
      setAngle(s.current);
      setPeak(s.peak);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  // -50deg at rest to +50deg at full scale, the sweep of a small panel movement.
  const deg = -50 + angle * 100;
  const targetDeg = -50 + Math.min(1, target / full) * 100;
  const peakDeg = -50 + peak * 100;
  const over = value !== null && value > target;

  return (
    <div className="flex flex-col">
      <div
        className="relative overflow-hidden rounded-[3px] bg-face"
        style={{ aspectRatio: "1.9 / 1", boxShadow: "inset 0 2px 6px oklch(70% 0.03 80 / 0.55)" }}
        role="meter"
        aria-valuenow={value ?? 0}
        aria-valuemin={0}
        aria-valuemax={full}
        aria-label={`${label}: ${value === null ? "no reading" : `${Math.round(value)} milliseconds, target ${target}`}`}
      >
        <svg viewBox="0 0 190 100" className="absolute inset-0 h-full w-full" aria-hidden>
          {/* scale arc */}
          <path
            d="M 28 88 A 72 72 0 0 1 162 88"
            fill="none"
            stroke="var(--color-face-ink)"
            strokeOpacity="0.32"
            strokeWidth="1"
          />
          {/* ticks */}
          {Array.from({ length: 11 }).map((_, i) => {
            const t = -50 + (i / 10) * 100;
            const major = i % 5 === 0;
            return (
              <line
                key={i}
                x1="95"
                y1={major ? 20 : 23}
                x2="95"
                y2={major ? 29 : 27}
                stroke="var(--color-face-ink)"
                strokeOpacity={major ? 0.7 : 0.35}
                strokeWidth={major ? 1.4 : 1}
                transform={`rotate(${t} 95 92)`}
              />
            );
          })}
          {/* The over-target zone is a band on the scale, the way a real movement marks
              it. Filling the whole wedge made every meter read as alarming at rest. */}
          <path
            d={arc(targetDeg, 50)}
            fill="none"
            stroke="var(--color-over)"
            strokeOpacity="0.8"
            strokeWidth="3.5"
          />
          <line
            x1="95"
            y1="16"
            x2="95"
            y2="30"
            stroke="var(--color-over)"
            strokeWidth="2"
            transform={`rotate(${targetDeg} 95 92)`}
          />
          {/* peak hold */}
          {peak > 0.02 && (
            <line
              x1="95"
              y1="21"
              x2="95"
              y2="29"
              stroke="var(--color-face-ink)"
              strokeOpacity="0.5"
              strokeWidth="1.5"
              transform={`rotate(${peakDeg} 95 92)`}
            />
          )}
          {/* needle */}
          <g transform={`rotate(${deg} 95 92)`}>
            <line
              x1="95"
              y1="92"
              x2="95"
              y2="24"
              stroke={over ? "var(--color-over)" : "var(--color-face-ink)"}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </g>
          <circle cx="95" cy="92" r="4.5" fill="var(--color-face-ink)" />
        </svg>

        <span
          className="legend absolute left-2 top-1.5 text-[9px] text-face-ink"
          style={{ opacity: 0.72 }}
        >
          {label}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between">
        <span
          className="figure text-lg"
          style={{ color: over ? "var(--color-over)" : "var(--color-legend)" }}
        >
          {value === null ? "—" : Math.round(value)}
          <span className="ml-0.5 text-[10px] text-legend-dim">ms</span>
        </span>
        <span className="figure text-[10px] text-legend-dim">≤{target}</span>
      </div>
    </div>
  );
}

/** Arc along the scale from `from` degrees to `to` degrees, around the needle pivot. */
function arc(from: number, to: number): string {
  const r = 68;
  const p = (d: number) => {
    const rad = ((d - 90) * Math.PI) / 180;
    return [95 + r * Math.cos(rad), 92 + r * Math.sin(rad)];
  };
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
}
