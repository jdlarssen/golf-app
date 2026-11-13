'use client';

import type { JSX } from 'react';
import { useTranslations } from 'next-intl';
import { LeaderboardBackLink } from '@/components/ui/LeaderboardBackLink';
import { SmartLink } from '@/components/ui/SmartLink';
import type { LiveBoardStripAction } from '@/lib/leaderboard/liveBoard';
import type { ScoreTone } from '@/lib/scoring/scoreTone';

// The pieces the solo board (`LiveBoard`) and the team board (`TeamBoard`) draw
// the same way (#2316): the header, the legend, the tone dots and the arrow
// for a place moved. Moved here from `LiveBoard.tsx`; nothing about the solo
// board changed.

/** A white plate on the board, pressed in at the bottom. */
export const PLATE_SHADOW = 'shadow-[inset_0_-2px_0_rgba(0,0,0,0.08)]';
/** The leader's plate: the same, plus a gold hairline. */
export const LEADER_PLATE_SHADOW =
  'shadow-[inset_0_-2px_0_rgba(0,0,0,0.08),inset_0_0_0_1px_var(--accent)]';

export const DOT: Record<ScoreTone, string> = {
  under: 'bg-score-under-fg',
  par: 'bg-score-par-fg',
  over1: 'bg-score-over1-fg',
  over2: 'bg-score-over2-fg',
  unset: 'bg-border',
};

const LEGEND: { tone: ScoreTone; key: 'legendUnder' | 'legendPar' | 'legendBogey' | 'legendDouble' }[] = [
  { tone: 'under', key: 'legendUnder' },
  { tone: 'par', key: 'legendPar' },
  { tone: 'over1', key: 'legendBogey' },
  { tone: 'over2', key: 'legendDouble' },
];

/** The deep-forest header: back link, the live pill, the game name, the title and the format line. */
export function BoardHeader({
  backHref,
  live,
  pill,
  gameName,
  title,
  formatLine,
}: {
  backHref: string;
  /** An active game gets the green live dot. */
  live: boolean;
  pill: string;
  gameName: string;
  title: string;
  formatLine: string;
}): JSX.Element {
  const tc = useTranslations('leaderboard.common');
  return (
    <header
      data-focus-surface="strong"
      className="rounded-2xl bg-surface-strong px-2 pt-2 pb-5 text-bg-tint"
    >
      <div className="flex items-center justify-between gap-3">
        <LeaderboardBackLink href={backHref} label={tc('backAriaLabel')} tone="onStrong" />
        <span
          data-testid="board-pill"
          className="mr-2 inline-flex items-center gap-1.5 rounded-full border border-bg-tint/35 px-3 py-1.5 text-xs font-semibold tabular-nums"
        >
          {live && <span aria-hidden className="h-2 w-2 rounded-full bg-success" />}
          {pill}
        </span>
      </div>
      <div className="px-3">
        <p className="truncate text-xs font-semibold text-bg-tint/80">{gameName}</p>
        <h1 className="mt-1 font-serif text-[40px] font-semibold leading-[1.05]">{title}</h1>
        <p className="mt-0.5 text-[13px] tabular-nums text-bg-tint/85">{formatLine}</p>
      </div>
    </header>
  );
}

/** «Under par · Par · Bogey · Dobbel+» and «Siste 5 hull» under the board. */
export function BoardLegend(): JSX.Element {
  const t = useTranslations('leaderboard.board');
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[11px] text-muted">
      <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {LEGEND.map(({ tone, key }) => (
          <span key={tone} className="inline-flex items-center gap-1">
            <span aria-hidden className={`h-2 w-2 rounded-full ${DOT[tone]}`} />
            {t(key)}
          </span>
        ))}
      </span>
      <span>{t('legendRecent')}</span>
    </div>
  );
}

/** ▲ for places up, ▼ for down, a dash for unchanged since the previous hole; nothing before two holes. */
export function Movement({ movement }: { movement: number | null }): JSX.Element | null {
  if (movement === null) return null;
  if (movement > 0) {
    return (
      <span
        aria-hidden
        data-testid="board-movement"
        data-movement={movement}
        className="shrink-0 text-[11px] font-semibold tabular-nums text-success-text"
      >
        ▲{movement}
      </span>
    );
  }
  if (movement < 0) {
    return (
      <span
        aria-hidden
        data-testid="board-movement"
        data-movement={movement}
        className="shrink-0 text-[11px] font-semibold tabular-nums text-score-over2-fg"
      >
        ▼{-movement}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      data-testid="board-movement"
      data-movement={0}
      className="shrink-0 text-[11px] text-muted"
    >
      –
    </span>
  );
}

/**
 * The strip at the bottom: «Din runde» / «Laget ditt», the place and the way
 * on («Hull 7», «Lever scorekort», nothing after delivery).
 */
export function StripFrame({
  kicker,
  text,
  action,
  rank,
  gap,
}: {
  kicker: string;
  text: string;
  action: LiveBoardStripAction;
  rank: number;
  gap: number | null;
}): JSX.Element {
  const t = useTranslations('leaderboard.board');
  return (
    <div
      data-testid="board-strip"
      data-rank={rank}
      data-gap={gap ?? undefined}
      className="sticky bottom-[calc(65px+env(safe-area-inset-bottom,0px))] z-20 mt-4"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 shadow-[0_6px_20px_rgba(26,46,31,0.10)]">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">{kicker}</p>
          <p className="mt-0.5 truncate font-serif text-[18px] font-medium tabular-nums text-text">
            {text}
          </p>
        </div>
        {action.kind !== 'none' && (
          <SmartLink
            data-testid="board-strip-action"
            data-kind={action.kind}
            href={action.href}
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-primary px-4 text-[14px] font-semibold text-white hover:bg-primary-hover dark:text-bg"
          >
            {action.kind === 'hole' ? t('stripHole', { hole: action.holeNumber }) : t('stripSubmit')}
          </SmartLink>
        )}
      </div>
    </div>
  );
}
