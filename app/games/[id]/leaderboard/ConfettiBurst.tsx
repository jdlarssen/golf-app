'use client';

import { useMemo } from 'react';

const CONFETTI_COLORS = [
  '#C9A961', // champagne
  '#D7BC78', // light champagne
  '#B89446', // dark champagne
  '#1B4332', // forest
  '#2E5C42', // sage
  '#F0EDE5', // linen
];

const PIECE_COUNT = 54;

type Piece = {
  dx: string;
  dy: string;
  dr: string;
  dur: string;
  delay: string;
  color: string;
  w: number;
  h: number;
};

function generatePieces(seed: number): Piece[] {
  // `seed` is unused as RNG input — it's just here as a dependency hint
  // for `useMemo` so each replay re-generates fresh pieces. We use Math.random
  // directly: a true seeded PRNG would give deterministic confetti, which is
  // visually duller than a fresh roll each time.
  void seed;
  return Array.from({ length: PIECE_COUNT }, () => {
    // Parametric trajectory per spec § confetti.
    //   angle spans roughly −75° to +75° from vertical.
    //   speed is the magnitude; cos(angle) biases dy toward "down".
    const angle = (Math.random() - 0.5) * Math.PI * 1.3;
    const speed = 90 + Math.random() * 120;
    const dx = Math.sin(angle) * speed;
    const dy = 80 + Math.cos(angle) * speed * 0.6 + Math.random() * 120;
    const dr = (Math.random() - 0.5) * 720;
    return {
      dx: `${Math.round(dx)}px`,
      dy: `${Math.round(dy)}px`,
      dr: `${Math.round(dr)}deg`,
      dur: `${Math.round(900 + Math.random() * 600)}ms`,
      delay: `${Math.round(Math.random() * 180)}ms`,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
      w: 3 + Math.random() * 4,
      h: 6 + Math.random() * 8,
    };
  });
}

/**
 * One-shot champagne burst anchored to the top of the leader card.
 *
 * Re-renders (with a fresh roll of pieces) every time `trigger` changes — the
 * outer `<div key={trigger}>` forces React to unmount/remount, so the CSS
 * animations restart cleanly. `trigger === 0` means "do not fire" (initial
 * idle state before the parent's mount-effect decides whether to auto-fire).
 *
 * The container is `position: absolute; height: 0; overflow: visible` so
 * pieces fall *outward* from the top of the leader card without affecting
 * its layout. Place inside a `position: relative` wrapper around the card.
 */
export function ConfettiBurst({ trigger }: { trigger: number }) {
  const pieces = useMemo(() => generatePieces(trigger), [trigger]);

  if (trigger === 0) return null;

  return (
    <div
      key={trigger}
      aria-hidden
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 0,
        pointerEvents: 'none',
        zIndex: 20,
        overflow: 'visible',
      }}
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              background: p.color,
              width: p.w,
              height: p.h,
              marginLeft: -(p.w / 2),
              '--dx': p.dx,
              '--dy': p.dy,
              '--dr': p.dr,
              '--dur': p.dur,
              '--delay': p.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
