"use client";

import { useEffect, useRef } from "react";

/**
 * Reveal a section once it enters the viewport.
 *
 * IntersectionObserver plus a data attribute, rather than an animation library: the two
 * motions that matter here are needle ballistics (which has to be hand-written anyway)
 * and this. Shipping 40kB of animation runtime on a page whose subject is latency would
 * be its own kind of joke.
 */
export function useReveal<T extends HTMLElement>(stagger = 0) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.shown = "true";
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        // Reveal when it comes into view, and also when it is already above the
        // viewport. A jump scroll or an anchor link can carry the page past a section
        // without ever rendering an intersecting frame, and revealing only on
        // intersection left that content invisible for the rest of the session.
        const passed = entry.boundingClientRect.top < 0;
        if (!entry.isIntersecting && !passed) return;
        window.setTimeout(() => {
          el.dataset.shown = "true";
        }, passed ? 0 : stagger);
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stagger]);

  return ref;
}
