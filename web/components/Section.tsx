"use client";

import type { ReactNode } from "react";
import { useReveal } from "@/lib/useReveal";

type Props = {
  id: string;
  index: string;
  title: string;
  lede?: ReactNode;
  children: ReactNode;
};

/**
 * One section of the desk: a numbered rail on the left, the argument on the right, and
 * the evidence full width underneath.
 */
export function Section({ id, index, title, lede, children }: Props) {
  const ref = useReveal<HTMLElement>();
  return (
    <section id={id} ref={ref} aria-labelledby={`${id}-heading`} className="reveal scored">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-10 lg:py-28">
        <div className="grid gap-5 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-10">
          <p className="figure pt-1 text-[12px] text-legend-dim lg:pt-3.5">{index}</p>
          <div>
            <h2
              id={`${id}-heading`}
              className="max-w-[22ch] text-[clamp(1.875rem,3.6vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.028em] text-face"
            >
              {title}
            </h2>
            {lede && (
              <p className="mt-5 max-w-[62ch] text-[16px] leading-[1.65] text-legend">{lede}</p>
            )}
          </div>
        </div>
        <div className="mt-12 lg:mt-16">{children}</div>
      </div>
    </section>
  );
}
