'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';

/** The artboard's size; the scene is laid out in these pixels and scaled whole. */
export const TV_STAGE_WIDTH = 1280;
export const TV_STAGE_HEIGHT = 720;

type Fit = { scale: number; left: number; top: number };

function fitToWindow(): Fit {
  const scale = Math.min(window.innerWidth / TV_STAGE_WIDTH, window.innerHeight / TV_STAGE_HEIGHT);
  return {
    scale,
    left: (window.innerWidth - TV_STAGE_WIDTH * scale) / 2,
    top: (window.innerHeight - TV_STAGE_HEIGHT * scale) / 2,
  };
}

/**
 * The big screen's scene (#2275): a fixed 1280 × 720 stage, as drawn, scaled
 * as a whole to the screen and centred. 1920 × 1080 is the drawing at 1.5×; a
 * 4:3 screen gets bands of the page colour above and below. Nothing ever
 * scrolls. Hidden until the first measurement, so it never flashes unscaled.
 * It also keeps the screen awake.
 */
export function TvStage({ children }: { children: ReactNode }) {
  const [fit, setFit] = useState<Fit | null>(null);
  useScreenWakeLock();

  useEffect(() => {
    const onResize = () => setFit(fitToWindow());
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      data-testid="tv-stage"
      className={`absolute top-0 left-0 origin-top-left ${fit ? '' : 'invisible'}`}
      style={{
        width: TV_STAGE_WIDTH,
        height: TV_STAGE_HEIGHT,
        transform: fit ? `translate(${fit.left}px, ${fit.top}px) scale(${fit.scale})` : undefined,
      }}
    >
      {children}
    </div>
  );
}
