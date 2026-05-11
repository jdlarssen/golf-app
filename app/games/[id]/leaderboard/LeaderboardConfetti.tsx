'use client';

import { useEffect, useMemo, useState } from 'react';

const CONFETTI_COLORS = [
  '#C9A961', // champagne gold
  '#D4B870', // light champagne
  '#1B4332', // deep forest
  '#4A7C59', // sage
  '#85B589', // light forest
];

const PARTICLE_COUNT = 32;
const TOTAL_DURATION_MS = 1500;
const STORAGE_PREFIX = 'golf-confetti-shown-';

type Particle = {
  id: number;
  left: string;
  dx: string;
  delay: number;
  duration: number;
  color: string;
  size: number;
  rotate: number;
};

function makeParticles(): Particle[] {
  // Deterministic-ish layout: spread starting positions evenly across the
  // viewport width, then jitter. This avoids visible clumps and keeps the
  // burst feeling premium.
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const baseLeft = (i / PARTICLE_COUNT) * 100;
    const jitter = (Math.random() - 0.5) * (100 / PARTICLE_COUNT);
    const drift = (Math.random() - 0.5) * 220; // px sideways drift
    return {
      id: i,
      left: `${Math.max(0, Math.min(100, baseLeft + jitter))}%`,
      dx: `${drift}px`,
      delay: Math.random() * 250,
      duration: 1100 + Math.random() * 400,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 6,
      rotate: Math.random() * 360,
    };
  });
}

/**
 * One-shot confetti burst fired the first time the user lands on the
 * leaderboard for a given game. Stored in localStorage so re-visits stay calm.
 *
 * Pure CSS animation (keyframes in globals.css); no JS animation loop, no
 * dependency. ~1.5s total, then unmounts to free DOM.
 */
export function LeaderboardConfetti({ gameId }: { gameId: string }) {
  const [show, setShow] = useState(false);
  const particles = useMemo(makeParticles, []);

  useEffect(() => {
    const key = `${STORAGE_PREFIX}${gameId}`;
    let alreadyShown = false;
    try {
      alreadyShown = window.localStorage.getItem(key) === '1';
    } catch {
      // localStorage may be disabled (private browsing). Skip the confetti
      // silently rather than throwing — it's a celebratory flourish.
      return;
    }
    if (alreadyShown) return;

    setShow(true);
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // ignored
    }

    const t = window.setTimeout(() => setShow(false), TOTAL_DURATION_MS + 250);
    return () => window.clearTimeout(t);
  }, [gameId]);

  if (!show) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      {particles.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              left: p.left,
              backgroundColor: p.color,
              width: p.size,
              height: p.size * 1.7,
              transform: `rotate(${p.rotate}deg)`,
              '--dx': p.dx,
              '--delay': `${p.delay}ms`,
              '--dur': `${p.duration}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
