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

function generatePieces(): Piece[] {
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
 * The burst runs *once per mount*. To replay, the caller must remount the
 * component — pass `key={someChangingNumber}` on `<ConfettiBurst />` itself,
 * and React will unmount the old instance and mount a fresh one, restarting
 * the CSS animations from the 0% keyframe.
 *
 * This is simpler (and more reliably re-fires) than the previous design,
 * which managed an inner `key={trigger}` *inside* the returned tree and
 * occasionally failed to restart animations in production reconciliations.
 *
 * The container is `position: absolute; height: 0; overflow: visible` so
 * pieces fall *outward* from the top of the leader card without affecting
 * layout. Place inside a `position: relative` wrapper around the card.
 */
export function ConfettiBurst() {
  // Fresh roll of pieces every mount. `useMemo` with no deps caches across
  // renders within the same mount — that's fine here since the component
  // is mounted once per replay and unmounted before the next.
  const pieces = useMemo(() => generatePieces(), []);

  return (
    <div
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
