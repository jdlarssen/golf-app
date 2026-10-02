'use client';

import { useEffect, useRef, useState } from 'react';
import { Kicker } from '@/components/ui/Kicker';
import {
  FRAMES,
  FRAME_DELAYS_MS,
  playFrames,
  type LiveBoardRow,
} from './landingLiveBoardFrames';

/**
 * The board card on the logged-out front page's green top (#2261), as the
 * artboard «Forslag: levende tavle på forsiden» draws it. Sample data: it
 * opens on hole 11, plays holes 12 and 13 once and stands still after 5 s.
 * With reduced motion it stays on hole 11.
 *
 * A tap on the card or any key before hole 13 freezes it on the frame it
 * shows (automatically updating content needs a way to stop it). Scrolling
 * and taps elsewhere on the page do not, so a visitor who scrolls in the
 * first seconds still sees it finish.
 *
 * Only text changes between frames — fixed row heights, no CSS animation, no
 * layout shift. Screen readers get the fixed caption; the visual part is
 * aria-hidden and there is no aria-live.
 *
 * The strings come translated from the server component (`AnonLanding`), so
 * `landing` stays out of the root client namespaces (#2227).
 */
export function LandingLiveBoard({
  kickers,
  live,
  pointsSuffix,
  caption,
  className = '',
}: {
  /** One per frame: «Lørdagsrunden · hull 11», … */
  kickers: string[];
  live: string;
  /** « p» after the points. */
  pointsSuffix: string;
  caption: string;
  className?: string;
}) {
  const [frame, setFrame] = useState(0);
  const figureRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const figure = figureRef.current;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    function detach() {
      figure?.removeEventListener('pointerdown', freeze);
      document.removeEventListener('keydown', freeze);
    }
    const stop = playFrames({
      delaysMs: FRAME_DELAYS_MS,
      reducedMotion,
      onFrame: (next) => {
        setFrame(next);
        if (next === FRAMES.length - 1) detach();
      },
    });
    function freeze() {
      stop();
      detach();
    }

    if (!reducedMotion) {
      figure?.addEventListener('pointerdown', freeze, { once: true });
      document.addEventListener('keydown', freeze, { once: true });
    }
    return () => {
      stop();
      detach();
    };
  }, []);

  const { rows } = FRAMES[frame];

  return (
    <figure
      ref={figureRef}
      data-testid="landing-live-board"
      className={`rounded-[18px] bg-bg px-3.5 pt-3.5 pb-2 text-text shadow-[0_18px_40px_rgba(0,0,0,0.28)] dark:ring-1 dark:ring-border ${className}`}
    >
      <div aria-hidden="true">
        <div className="flex items-center justify-between">
          <Kicker>{kickers[frame]}</Kicker>
          <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-primary-soft px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            <span className="block size-1.5 shrink-0 rounded-full bg-live-dot" />
            {live}
          </span>
        </div>
        <div className="mt-1.5">
          {rows.map((row, index) => (
            <BoardRow
              key={index}
              place={index + 1}
              row={row}
              pointsSuffix={pointsSuffix}
            />
          ))}
        </div>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

// Keyed by place, not name: the rows stay put and only their text changes.
function BoardRow({
  place,
  row,
  pointsSuffix,
}: {
  place: number;
  row: LiveBoardRow;
  pointsSuffix: string;
}) {
  return (
    <div
      data-testid="landing-live-board-row"
      className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-row-divider-warm py-[9px] last:border-b-0"
    >
      <span className="text-center font-serif text-base leading-5 font-semibold">
        {place}
      </span>
      <span className="text-[15px] leading-[19px] font-semibold">
        {row.name}
        {row.move && (
          <>
            {' '}
            <span
              className={`text-[11px] font-semibold ${
                row.move.dir === 'up' ? 'text-rank-up' : 'text-score-over2-fg'
              }`}
            >
              {row.move.dir === 'up' ? '▲' : '▼'} {row.move.by}
            </span>
          </>
        )}
      </span>
      <span className="font-serif text-lg leading-[23px] font-semibold tabular-nums">
        {row.points}
        {pointsSuffix}
      </span>
    </div>
  );
}
