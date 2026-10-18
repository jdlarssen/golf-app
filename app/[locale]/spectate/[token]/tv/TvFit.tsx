'use client';

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

const MIN_FIT = 0.4;
const STEP = 0.05;

/**
 * Shrinks the text inside a podium card until it fits the card (#2298). The
 * card's height is fixed as drawn, and four members with long names, or a
 * shared place, would otherwise run out of it. The children size their text
 * as `calc(<px> * var(--fit, 1))`; this lowers `--fit` in 5 % steps while the
 * box overflows. Measured before the stage's scale transform, so the result
 * is the same on every screen size. Remount (a new `key`) to fit new content.
 */
export function TvFit({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      let f = 1;
      el.style.setProperty('--fit', '1');
      while (
        f > MIN_FIT &&
        (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
      ) {
        f = Math.round((f - STEP) * 100) / 100;
        el.style.setProperty('--fit', String(f));
      }
    };
    fit();
    // The web fonts change the measure once they arrive.
    void document.fonts?.ready.then(fit);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div ref={ref} className={className} style={{ '--fit': 1 } as CSSProperties}>
      {children}
    </div>
  );
}
