'use client';

import { useState, type JSX, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ScoreShape } from '@/components/scoring/ScoreShape';
import { Kicker } from '@/components/ui/Kicker';
import { useOnline } from '@/hooks/useOnline';
import { Link } from '@/i18n/navigation';
import { firstName } from '@/lib/firstName';
import {
  followHref,
  forgetFollow,
  spectatePath,
  type FollowNext,
  type FollowViewData,
} from '@/lib/leaderboard/followPlayer';
import type {
  LiveBoard as LiveBoardData,
  LiveBoardRecentHole,
  LiveBoardRow,
  LiveBoardUnit,
} from '@/lib/leaderboard/liveBoard';
import { strokeTerm } from '@/lib/scorecard/scoreRail';
import { scoreShape } from '@/lib/scoring/scoreShape';
import { scoreTone } from '@/lib/scoring/scoreTone';
import type { UnderParMoment } from '@/lib/stats/achievements';
import {
  behindLeaderText,
  boardDisplayName,
  boardRowSr,
  followTotalLabel,
  isBoardLeader,
  placeLabel,
  totalLabel,
  totalSr,
  visibleBoardRows,
  type FollowT,
} from './boardText';

const MOMENT_KEY: Record<UnderParMoment, 'momentHoleInOne' | 'momentAlbatross' | 'momentEagle' | 'momentBirdie'> = {
  hole_in_one: 'momentHoleInOne',
  albatross: 'momentAlbatross',
  eagle: 'momentEagle',
  birdie: 'momentBirdie',
};

/** PLASS · SPILLER · HULL · TOTAL, as the artboard's table. */
const ROW = 'grid grid-cols-[28px_minmax(0,1fr)_44px_44px] items-center gap-2 px-3.5 py-2.5';

export interface FollowViewProps {
  /** The live link's token; every follow link is the unprefixed `/spectate/<token>`. */
  token: string;
  board: LiveBoardData;
  view: FollowViewData;
  /** «{spillnavn} · {bane}» (`followSubtitle`). */
  subtitle: string;
  /** «Lag din egen turnering på et par minutter →», hidden for a signed-in viewer. */
  cta: ReactNode;
  /** The withdrawn players, when there are any. */
  footerSlot?: ReactNode;
}

/**
 * Heiagjengen (#2286): the live link while following one player — the green
 * head with place and total, the last five holes, the rest of the flight and
 * the board below. Drawn after the artboard «Forslag: heiagjengen».
 *
 * `data-follow-view` lets `app/globals.css` hide the spectate banner and the
 * default call to action while this page is shown. The page's 20 s refresh is
 * still owned by the banner's `SpectateLiveStatus`; the LIVE pill here only
 * reads the connection, so it never says «live» over numbers it cannot update.
 */
export function FollowView({ token, board, view, subtitle, cta, footerSlot }: FollowViewProps): JSX.Element {
  const t = useTranslations('leaderboard.board');
  const tc = useTranslations('leaderboard.common');
  const tf = useTranslations('spectate.follow');
  const ts = useTranslations('spectate');
  const online = useOnline();
  const [showAll, setShowAll] = useState(false);

  const { row, standing, lead, next, moment, others } = view;
  const { unit } = board;
  const showRank = board.holesPlayed !== 0;
  const leader = isBoardLeader(row);
  const displayName = (r: LiveBoardRow) => boardDisplayName(r, tc);
  const name = displayName(row);

  const pill = !online
    ? ts('offlineStatus')
    : board.holesPlayed === 0
      ? t('pillLive')
      : t('pillLiveAfter', { holes: board.holesPlayed });

  const line =
    row.total === null
      ? null
      : standing.rank === 1 && standing.tied
        ? tf('tiedLead')
        : lead !== null
          ? unit === 'points'
            ? tf('leadPoints', { gap: lead })
            : tf('leadStrokes', { gap: lead })
          : behindLeaderText(t, standing, unit, board.rows, displayName);

  const standingSr = [
    !showRank ? null : row.tied ? t('srTiedPlace', { rank: row.rank }) : t('srPlace', { rank: row.rank }),
    totalSr(t, unit, row.total),
  ]
    .filter(Boolean)
    .join('. ');

  const { visible, canCollapse } = visibleBoardRows(board.rows, row.userId, showAll);

  const seeBoard = (placement: string) => (
    <Link
      href={spectatePath(token)}
      replace
      data-testid="follow-see-board"
      onClick={() => forgetFollow(token)}
      className={`${placement} font-sans text-[12px] font-semibold leading-[normal] text-primary`}
    >
      {tf('seeWholeBoard')}
    </Link>
  );

  return (
    <div data-follow-view className="flex min-h-dvh flex-col leading-[normal]">
      <header data-focus-surface="strong" className="bg-surface-strong px-5 pt-3.5 pb-[18px] text-on-strong">
        <div className="flex items-center justify-between">
          <span className="font-serif text-[20px] font-semibold leading-[normal]">Tørny</span>
          <span
            data-testid="follow-live-pill"
            data-live={online ? 'online' : 'offline'}
            className="flex h-6 items-center gap-1.5 rounded-full bg-on-strong/14 px-2.5 text-[10px] font-semibold uppercase leading-[normal] tracking-[0.16em]"
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full bg-live-dot-on-strong ${online ? '' : 'opacity-50'}`}
            />
            {pill}
          </span>
        </div>
        <div
          aria-hidden
          className="mt-4 text-[10px] font-semibold uppercase leading-[normal] tracking-[0.22em] text-on-strong/80"
        >
          {tf('kicker')}
        </div>
        <div className="mt-0.5 flex items-end justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-[32px] font-medium leading-[1.05]">
              <span className="sr-only">{tf('kicker')} </span>
              {name}
            </h1>
            <p className="mt-1 text-[13px] leading-[normal] text-on-strong/85">{subtitle}</p>
          </div>
          <div className="shrink-0 text-right">
            <span className="sr-only">{standingSr}</span>
            <div aria-hidden className="flex items-center justify-end gap-2">
              <span
                data-testid="follow-place"
                data-leader={leader || undefined}
                className={`flex h-[30px] w-[30px] items-center justify-center rounded-full font-serif text-[15px] font-semibold leading-[normal] ${leader ? 'bg-accent text-on-accent' : 'bg-on-strong/14 text-on-strong'}`}
              >
                {placeLabel(t, row, showRank)}
              </span>
              <span
                className={`font-serif text-[30px] font-semibold leading-[normal] ${leader ? 'text-accent-on-strong' : 'text-on-strong'}`}
              >
                {followTotalLabel(tf, unit, row.total)}
              </span>
            </div>
            {line && <p className="mt-0.5 text-[12px] leading-[normal] text-on-strong/85">{line}</p>}
          </div>
        </div>
      </header>

      <section
        data-testid="follow-holes"
        className="mx-4 mt-3.5 rounded-2xl border border-border bg-surface px-3.5 py-3"
      >
        <div className="flex items-baseline justify-between">
          <Kicker className="leading-[normal]">{tf('recentKicker')}</Kicker>
          {next && (
            <span data-testid="follow-next" data-kind={next.kind} className="text-[12px] leading-[normal] text-muted">
              {nextText(tf, next)}
            </span>
          )}
        </div>
        {row.recentHoles.length > 0 && (
          <ol className="mt-2.5 grid grid-cols-5 gap-1.5 text-center">
            {row.recentHoles.map((hole, i) => (
              <RecentHole
                key={hole.holeNumber}
                hole={hole}
                unit={unit}
                newest={i === row.recentHoles.length - 1}
                moment={i === row.recentHoles.length - 1 ? moment : null}
              />
            ))}
          </ol>
        )}
      </section>

      {others.length > 1 && (
        <>
          <div className="relative">
            <Kicker className="leading-[normal] px-5 pt-4 pb-2">{tf('othersKicker')}</Kicker>
            {seeBoard('absolute right-5 bottom-2 inline-flex h-11 items-end')}
          </div>
          <nav
            aria-label={tf('othersKicker')}
            className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {others.map(({ row: other, fullName }) => {
              const selected = other.userId === row.userId;
              const label = fullName ? displayName(other) : (firstName(other.name) ?? displayName(other));
              return (
                <Link
                  key={other.userId}
                  href={followHref(token, other.userId)}
                  replace
                  data-testid="follow-other"
                  aria-current={selected ? 'true' : undefined}
                  aria-label={tf('followName', { name: label })}
                  className={`inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold leading-[normal] ${selected ? 'bg-primary text-white dark:text-bg' : 'border border-border bg-surface text-text'}`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </>
      )}

      <div data-testid="follow-board-heading" className="relative">
        <Kicker className="leading-[normal] px-5 pt-4 pb-2">{tf('boardKicker')}</Kicker>
        {/* Alone in the flight there is no «Følg en annen» row; the link
            moves to this heading, in the same place. */}
        {others.length <= 1 && seeBoard('absolute right-5 bottom-2 inline-flex h-11 items-end')}
      </div>
      <ol
        data-testid="follow-board"
        className="mx-4 overflow-hidden rounded-2xl border border-border bg-surface"
      >
        {visible.map((item, i) => {
          const divider = i > 0 ? 'border-t border-row-divider-warm' : '';
          if (item === 'gap') {
            return (
              <li
                key="gap"
                aria-hidden
                data-testid="follow-board-gap"
                className={`${divider} py-1 text-center text-[13px] leading-[normal] text-muted`}
              >
                …
              </li>
            );
          }
          const followed = item.userId === row.userId;
          const rowName = displayName(item);
          const cells = (
            <>
              <span className="text-center font-serif text-[16px] font-semibold leading-[normal]">
                {placeLabel(t, item, showRank)}
              </span>
              <span className="truncate text-[15px] font-semibold leading-[normal]">{rowName}</span>
              <span className="text-right text-[12px] leading-[normal] text-muted">{item.holesPlayed}</span>
              <span className="text-right font-serif text-[17px] font-semibold leading-[normal]">
                {totalLabel(unit, item.total)}
              </span>
            </>
          );
          return (
            <li key={item.userId} data-testid="follow-board-row" data-user-id={item.userId} data-followed={followed || undefined}>
              {followed ? (
                <div
                  aria-hidden
                  className={`${ROW} ${divider} bg-primary-soft dark:ring-1 dark:ring-inset dark:ring-primary/70`}
                >
                  {cells}
                </div>
              ) : (
                <Link
                  href={followHref(token, item.userId)}
                  replace
                  aria-label={tf('followName', { name: rowName })}
                  className={`${ROW} ${divider}`}
                >
                  {cells}
                </Link>
              )}
              <span className="sr-only">
                {rowName}. {boardRowSr(t, tc, { row: item, unit, showRank, isYou: false })}
              </span>
            </li>
          );
        })}
      </ol>
      {canCollapse && (
        <button
          type="button"
          data-testid="follow-board-toggle"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
          className="mx-4 mt-2.5 min-h-11 rounded-xl border border-border bg-surface text-[13px] font-semibold leading-[normal] text-primary"
        >
          {showAll ? t('showFewer') : t('showAll', { count: board.rows.length })}
        </button>
      )}

      {footerSlot && <div className="mx-4">{footerSlot}</div>}
      <div className="mx-4 mt-3.5">{cta}</div>
    </div>
  );
}

function nextText(tf: FollowT, next: FollowNext): string {
  switch (next.kind) {
    case 'hole':
      return tf('next', { hole: next.holeNumber, par: next.par });
    case 'allPlayed':
      return tf('allPlayed');
    case 'submitted':
      return tf('submitted');
    case 'notStarted':
      return tf('notStarted');
  }
}

function RecentHole({
  hole,
  unit,
  newest,
  moment,
}: {
  hole: LiveBoardRecentHole;
  unit: LiveBoardUnit;
  newest: boolean;
  moment: UnderParMoment | null;
}) {
  const tf = useTranslations('spectate.follow');
  const tterm = useTranslations('holes.scoreRail.term');
  const term = strokeTerm(hole.gross, hole.par);
  const termText = term === 'over' ? tterm('over', { n: hole.gross - hole.par }) : tterm(term);
  const inPoints = unit === 'points';
  const under = inPoints
    ? tf('holePoints', { points: hole.points ?? 0 })
    : tf('holeNet', { net: hole.net ?? 0 });
  const sr = inPoints
    ? tf('srHolePoints', { hole: hole.holeNumber, strokes: hole.gross, term: termText, points: hole.points ?? 0 })
    : tf('srHoleNet', { hole: hole.holeNumber, strokes: hole.gross, term: termText, net: hole.net ?? 0 });

  return (
    <li data-testid="follow-hole" data-hole={hole.holeNumber} data-newest={newest || undefined}>
      <div
        aria-hidden
        className={`text-[11px] leading-[normal] ${newest ? 'font-semibold text-text' : 'text-muted'}`}
      >
        {hole.holeNumber}
      </div>
      <div aria-hidden className="mx-auto mt-1 w-[34px] font-serif text-[17px] font-semibold leading-[normal]">
        <ScoreShape shape={scoreShape(hole.gross, hole.par)} tone={scoreTone(hole.gross, hole.par)} size="follow">
          {hole.gross}
        </ScoreShape>
      </div>
      <div
        aria-hidden
        data-testid={moment ? 'follow-moment' : undefined}
        className={`text-[11px] leading-[normal] ${moment ? 'font-semibold text-score-under-ring' : 'text-muted'}`}
      >
        {moment ? tf(MOMENT_KEY[moment]) : under}
      </div>
      <span className="sr-only">{sr}</span>
    </li>
  );
}
