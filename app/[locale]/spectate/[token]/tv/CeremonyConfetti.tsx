'use client';

import { useSyncExternalStore } from 'react';
import { ConfettiBurst } from '@/app/[locale]/games/[id]/leaderboard/ConfettiBurst';

const noop = () => () => {};

/**
 * The winner card's confetti (#2298), mounted only in the browser: the burst
 * rolls its pieces with `Math.random()`, so a server render would never match
 * the client's. The caller keys it on the step, so it bursts once per reveal.
 * `prefers-reduced-motion` hides the pieces (`globals.css`).
 */
export function CeremonyConfetti() {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? <ConfettiBurst /> : null;
}
