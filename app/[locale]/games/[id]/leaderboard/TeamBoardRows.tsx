'use client';

import { useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import {
  boardRowSrParts,
  boardShowsPlace,
  isBoardLeader,
  placeKind,
  totalLabel,
  visibleBoardRows,
} from '@/lib/leaderboard/boardRules';
import type { LiveBoardStripAction, LiveBoardUnit } from '@/lib/leaderboard/liveBoard';
import type { TeamDisplayUnit } from '@/lib/leaderboard/teamLiveBoard';
import type { ScoreTone } from '@/lib/scoring/scoreTone';
import { BoardHeader, DOT, Movement, StripFrame } from './boardParts';
import { rowSrPartText, type BoardCommonT, type BoardT } from './boardText';
import { TeamHoleCard, type TeamHoleCardData } from './TeamHoleCard';

// The team board (#2316): scramble (texas, ambrose, florida), team stableford,
// shamble and best ball, after `Lagtavle-forslag` and `Lagtavle-bestball-forslag`
// on the design canvas. Same header and strip as the solo board
// (`LiveBoard`), with a card per team instead of a plate per player.
//
// Every number is fed in ready (`teamLiveBoard` + the engine, computed on the
// server in `formats/teamLiveBoard.tsx`); this only lays them out. A team row
// has no reaction button (a reaction goes to one player) and the names do not
// link to the follow page.

export type TeamBoardRowData = {
  teamNumber: number;
  /** «Lag 3». */
  name: string;
  rank: number;
  tied: boolean;
  total: number | null;
  holesPlayed: number;
  /** Places moved since the team's previous hole; `null` under two holes. */
  movement: number | null;
  /** The last five played holes, oldest first. */
  recent: ScoreTone[];
  /** Every hole in the result in hole order, `unset` for one not played (best ball's first half). */
  tones: ScoreTone[];
  /** Initials of the members, in the order of `members`; the viewer first. */
  initials: string[];
  /** The members as a list («Deg, Marte og Jonas»). */
  members: string;
  /** The viewer's team. */
  you: boolean;
};

export type TeamBoardData = {
  /** The unit the totals are read in (`teamBoardMeasure`); the number format. */
  unit: LiveBoardUnit;
  /** The unit named under the total: net, gross (shamble), points or to par. */
  displayUnit: TeamDisplayUnit;
  /** The furthest-along team's holes. */
  holesPlayed: number;
  rows: TeamBoardRowData[];
  /** Best ball while the round is on: the first half is open, the rest is held back (#1978). */
  firstHalf: {
    /** The holes in the open half. */
    holes: number;
    shown: { from: number; to: number };
    hidden: { from: number; to: number };
    /** «Vi sees ved hull {last}». */
    last: number;
  } | null;
};

export type TeamStripData = {
  rank: number;
  tied: boolean;
  /** Strokes (points in team stableford) behind the lead; `null` when leading or not comparable. */
  gap: number | null;
  /** «Lag 3», or `null` on a shared lead. */
  leaderName: string | null;
  inPoints: boolean;
  /** Best ball's first half: «8 av 9 hull» instead of the gap. */
  ofHoles: { played: number; total: number } | null;
  action: LiveBoardStripAction;
};

export interface TeamBoardProps {
  kind: 'team';
  gameName: string;
  status: 'scheduled' | 'active';
  /** Server-translated status name, shown in the pill of a scheduled game. */
  statusLabel: string;
  /** «Texas scramble · 4 lag à 4 · netto». */
  formatLine: string;
  board: TeamBoardData;
  /** The viewer's strip, or `null` for none (public views, an organizer who does not play). */
  strip: TeamStripData | null;
  holeCard: TeamHoleCardData | null;
  backHref: string;
  testId: 'team-leaderboard';
}

export function TeamBoard({
  gameName,
  status,
  statusLabel,
  formatLine,
  board,
  strip,
  holeCard,
  backHref,
  testId,
}: TeamBoardProps): JSX.Element {
  const t = useTranslations('leaderboard.board');
  const tt = useTranslations('leaderboard.board.team');
  const ts35 = useTranslations('leaderboard.state35');
  const tc = useTranslations('leaderboard.common');
  const [showAll, setShowAll] = useState(false);

  const { rows, firstHalf } = board;
  const viewerTeam = rows.find((r) => r.you)?.teamNumber ?? null;
  const { visible, canCollapse } = visibleBoardRows(rows, viewerTeam, showAll, (r) => r.teamNumber);
  const showPlace = boardShowsPlace(board);
  const pill =
    status === 'scheduled'
      ? statusLabel
      : board.holesPlayed === 0
        ? t('pillLive')
        : t('pillLiveAfter', { holes: board.holesPlayed });

  return (
    <div>
      <BoardHeader
        backHref={backHref}
        live={status === 'active'}
        pill={pill}
        gameName={gameName}
        title={tt('title')}
        formatLine={formatLine}
      />

      {rows.length === 0 ? (
        <p className="mt-12 text-center text-sm text-muted">{tc('noPlayersToShow')}</p>
      ) : (
        <>
          {firstHalf && (
            <div className="mt-3 flex items-center justify-between gap-3 px-1 text-xs font-semibold text-muted">
              <span>{ts35('segmentHalfLabel', firstHalf.shown)}</span>
              <span className="inline-flex items-center gap-1.5">
                <LockIcon size={12} />
                {tt('hiddenHalf', firstHalf.hidden)}
              </span>
            </div>
          )}

          <ol data-testid={testId} className={`${firstHalf ? 'mt-2' : 'mt-3'} flex flex-col gap-2`}>
            {visible.map((item) =>
              item === 'gap' ? (
                <li
                  key="gap"
                  data-testid="board-gap"
                  aria-hidden
                  className="list-none text-center text-[15px] leading-none text-muted"
                >
                  …
                </li>
              ) : (
                <TeamRow
                  key={item.teamNumber}
                  row={item}
                  board={board}
                  showPlace={showPlace}
                  t={t}
                  tc={tc}
                />
              ),
            )}
          </ol>

          {canCollapse && (
            <button
              type="button"
              data-testid="board-toggle"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
              className="mt-2.5 h-11 w-full rounded-xl border border-border bg-surface text-[13px] font-semibold text-primary"
            >
              {showAll ? t('showFewer') : tt('showAll', { count: rows.length })}
            </button>
          )}

          {firstHalf && (
            <div
              data-testid="team-lock-card"
              className="mt-3 flex items-start gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3"
            >
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-primary"
              >
                <LockIcon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block font-serif text-[17px] font-semibold text-text">
                  {ts35('lockedHeading', { last: firstHalf.last })}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">
                  {ts35('lockedSub', firstHalf.hidden)}
                </span>
              </span>
            </div>
          )}

          {holeCard && <TeamHoleCard {...holeCard} />}
        </>
      )}

      {strip && <TeamStrip strip={strip} />}
    </div>
  );
}

function TeamRow({
  row,
  board,
  showPlace,
  t,
  tc,
}: {
  row: TeamBoardRowData;
  board: TeamBoardData;
  showPlace: boolean;
  t: BoardT;
  tc: BoardCommonT;
}): JSX.Element {
  const tt = useTranslations('leaderboard.board.team');
  const firstHalf = board.firstHalf !== null;
  // No leader's gold where the board shows no place (#2712).
  const leader = showPlace && isBoardLeader(row);
  const you = row.you;
  // Live, only the leader and the viewer's team carry dots and the arrow (the
  // app's rule); best ball draws the dots on every team and has no arrow.
  const marked = (leader || you) && row.holesPlayed > 0;
  const movement = !firstHalf && marked ? row.movement : null;
  const recent = firstHalf || marked ? row.recent : [];
  const dots = firstHalf ? row.tones : marked ? row.recent : null;

  const unitText = (() => {
    switch (board.displayUnit) {
      case 'points':
        return tc('poengLabel');
      case 'toPar':
        return tc('vsParLabel');
      case 'gross':
        return tt('unitGross');
      case 'net':
        return tt('unitNet');
    }
  })();
  const holesText = tt('holes', { holes: row.holesPlayed });
  const under = firstHalf
    ? tt('ofHoles', { played: row.holesPlayed, total: board.firstHalf!.holes })
    : marked
      ? unitText
      : holesText;

  const place = placeKind(row, showPlace);
  const placeText = place === 'none' ? '–' : place === 'tied' ? t('tiedRank', { rank: row.rank }) : String(row.rank);
  const showInitials = leader && row.initials.length > 0;
  const showNames = !leader || you;

  const sr = [
    row.name,
    ...boardRowSrParts({
      row: { ...row, movement, recent },
      unit: board.unit,
      showRank: showPlace,
      isYou: you,
    }).map((part) => {
      if (part.key === 'you') return tt('srYourTeam');
      if (part.key === 'total' && part.total.kind === 'net' && board.displayUnit === 'gross') {
        return tt('srGross', { total: part.total.value });
      }
      return rowSrPartText(t, tc, part);
    }),
    row.members,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <li
      className="list-none"
      data-testid="board-row"
      data-team={row.teamNumber}
      data-rank={row.rank}
      data-you={you || undefined}
      data-leader={leader || undefined}
    >
      <div
        className={`grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-2xl border px-3 py-2.5 ${
          you
            ? 'border-primary/30 bg-primary-soft dark:ring-1 dark:ring-inset dark:ring-primary/60'
            : 'border-border bg-surface'
        } ${leader ? 'shadow-[inset_0_0_0_1px_var(--accent)]' : ''}`}
      >
        <span aria-hidden data-testid="board-place" className="flex items-center justify-center">
          {leader ? (
            <span className="score-num grid h-[30px] w-[30px] place-items-center rounded-full bg-accent text-[15px] font-semibold text-surface-strong">
              {placeText}
            </span>
          ) : (
            <span className="score-num text-[18px] font-semibold">{placeText}</span>
          )}
        </span>

        <span aria-hidden className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{row.name}</span>
            {showInitials && <Initials initials={row.initials} />}
            {showInitials && firstHalf && !you && (
              <span className="truncate text-xs text-muted">{row.members}</span>
            )}
            {you && <span className="shrink-0 text-xs font-semibold text-primary">{tt('yourTeam')}</span>}
          </span>
          {showNames && (
            <span className="mt-0.5 block truncate text-xs text-muted">{row.members}</span>
          )}
          {dots && (
            <span className="mt-1.5 flex items-center gap-1">
              {dots.map((tone, i) =>
                tone === 'unset' && firstHalf ? (
                  <span
                    key={i}
                    data-testid="board-dot"
                    data-tone="unset"
                    className="box-border h-[9px] w-[9px] rounded-full border-[1.5px] border-muted"
                  />
                ) : (
                  <span
                    key={i}
                    data-testid="board-dot"
                    data-tone={tone}
                    className={`h-[9px] w-[9px] rounded-full ${DOT[tone]}`}
                  />
                ),
              )}
              {firstHalf ? (
                <span
                  data-testid="board-hidden-holes"
                  className="ml-1 h-[9px] min-w-10 grow rounded-full shadow-[inset_0_0_0_1px_var(--border)]"
                  style={{
                    background:
                      'repeating-linear-gradient(135deg, var(--border) 0 3px, var(--surface-2) 3px 6px)',
                  }}
                />
              ) : (
                <span className="ml-1 inline-flex items-center gap-1 text-[11px] tabular-nums text-muted">
                  {holesText}
                  {movement !== null && (
                    <>
                      <span aria-hidden>·</span>
                      <Movement movement={movement} />
                    </>
                  )}
                </span>
              )}
            </span>
          )}
        </span>

        <span aria-hidden className="text-right">
          <span
            data-testid="board-total"
            className={`score-num block text-[24px] font-semibold leading-tight ${
              leader ? 'text-accent-text' : ''
            }`}
          >
            {totalLabel(board.unit, row.total)}
          </span>
          <span className="block text-[11px] tabular-nums text-muted">{under}</span>
        </span>
      </div>
      <span className="sr-only">{sr}</span>
    </li>
  );
}

/** The members' initials in a small overlapping stack: at most four, then «+N». */
function Initials({ initials }: { initials: string[] }): JSX.Element {
  const shown = initials.slice(0, 4);
  const extra = initials.length - shown.length;
  return (
    <span aria-hidden className="flex shrink-0" data-testid="team-initials">
      {shown.map((initial, i) => (
        <span
          key={i}
          className={`grid h-[22px] w-[22px] place-items-center rounded-full bg-primary-soft text-[9px] font-semibold text-primary ring-2 ring-surface ${
            i > 0 ? '-ml-[5px]' : ''
          }`}
        >
          {initial}
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-[5px] grid h-[22px] min-w-[22px] place-items-center rounded-full bg-primary-soft px-1 text-[9px] font-semibold text-primary ring-2 ring-surface">
          +{extra}
        </span>
      )}
    </span>
  );
}

function TeamStrip({ strip }: { strip: TeamStripData }): JSX.Element {
  const t = useTranslations('leaderboard.board');
  const tt = useTranslations('leaderboard.board.team');
  const place = strip.tied
    ? t('stripTiedPlace', { rank: strip.rank })
    : t('stripPlace', { rank: strip.rank });
  const detail = strip.ofHoles
    ? tt('stripOfHoles', strip.ofHoles)
    : strip.gap === null || strip.gap <= 0
      ? null
      : strip.leaderName === null
        ? t(strip.inPoints ? 'behindPointsLead' : 'behindStrokesLead', { gap: strip.gap })
        : t(strip.inPoints ? 'behindPoints' : 'behindStrokes', { gap: strip.gap, name: strip.leaderName });
  return (
    <StripFrame
      kicker={tt('stripKicker')}
      text={[place, detail].filter(Boolean).join(' · ')}
      action={strip.action}
      rank={strip.rank}
      gap={strip.gap}
    />
  );
}

function LockIcon({ size }: { size: number }): JSX.Element {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
