/**
 * The board card on the logged-out front page (#2261): sample data for three
 * holes of a stableford round, and the timer that plays them once. Plain TS
 * (no React, no 'use client') so the server renders frame 1 from the same
 * constant the client steps through.
 *
 * Hole 11 is the artboard «Forslag: levende tavle på forsiden». The names are
 * sample data and the same in both languages.
 */

export type LiveBoardMove = { dir: 'up' | 'down'; by: number };

export type LiveBoardRow = {
  name: string;
  points: number;
  /** Only on a row that moved since the hole before. */
  move?: LiveBoardMove;
};

export type LiveBoardFrame = { hole: number; rows: LiveBoardRow[] };

export const FRAMES: readonly LiveBoardFrame[] = [
  {
    hole: 11,
    rows: [
      { name: 'Marte', points: 26 },
      { name: 'Jonas', points: 24, move: { dir: 'up', by: 2 } },
      { name: 'Anders', points: 23 },
    ],
  },
  {
    hole: 12,
    rows: [
      { name: 'Marte', points: 28 },
      { name: 'Jonas', points: 27 },
      { name: 'Anders', points: 25 },
    ],
  },
  {
    hole: 13,
    rows: [
      { name: 'Jonas', points: 30, move: { dir: 'up', by: 1 } },
      { name: 'Marte', points: 29, move: { dir: 'down', by: 1 } },
      { name: 'Anders', points: 27 },
    ],
  },
];

/** When frames 2 and 3 show, from mount. All done after 5 s. */
export const FRAME_DELAYS_MS: readonly number[] = [2500, 5000];

/**
 * Starts one timer per delay; timer `i` shows frame `i + 1`. With reduced
 * motion nothing starts, and the card stays on frame 1. Returns `stop()`,
 * which clears whatever is still pending — the effect calls it on unmount and
 * when the visitor freezes the card. Safe to call more than once.
 */
export function playFrames({
  delaysMs,
  reducedMotion,
  onFrame,
}: {
  delaysMs: readonly number[];
  reducedMotion: boolean;
  onFrame: (frame: number) => void;
}): () => void {
  if (reducedMotion) return () => {};
  const timers = delaysMs.map((delay, i) =>
    setTimeout(() => onFrame(i + 1), delay),
  );
  return () => {
    for (const timer of timers) clearTimeout(timer);
  };
}
