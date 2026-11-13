'use client';

import { useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import {
  viewerStanding,
  type LiveBoard as LiveBoardData,
  type LiveBoardRow,
  type LiveBoardStripAction,
  type LiveBoardUnit,
  type ViewerStanding,
} from '@/lib/leaderboard/liveBoard';
import { followHref } from '@/lib/leaderboard/followPlayer';
import { BoardPlayerPlate } from './BoardRowReactions';
import { BoardHeader, BoardLegend, DOT, LEADER_PLATE_SHADOW, Movement, PLATE_SHADOW, StripFrame } from './boardParts';
import { TeamBoard, type TeamBoardProps } from './TeamBoardRows';
import {
  boardShowsPlace,
  isBoardLeader,
  totalLabel,
  visibleBoardRows,
} from '@/lib/leaderboard/boardRules';
import {
  behindLeaderText,
  boardDisplayName,
  boardRowSr,
  columnHeading,
  pillText,
  placeLabel,
  totalSr,
} from './boardText';
import { RowReactionsForPlayer } from './RowReactionsForPlayer';

/** PLASS · SPILLER · HULL · POENG — one grid for the headings and every row. */
const COLUMNS = 'grid grid-cols-[44px_minmax(0,1fr)_46px_58px] gap-1.5';

export interface SoloBoardProps {
  /** Solo is the default; `kind: 'team'` is the team board (#2316). */
  kind?: 'solo';
  gameName: string;
  status: 'scheduled' | 'active';
  /** Server-translated status name, shown in the pill of a scheduled game. */
  statusLabel: string;
  /** Server-translated format name («Stableford», «Slagspill»). */
  formatLabel: string;
  /** Distinct flights among the players on the board; the line leaves it out at one. */
  flights: number;
  board: LiveBoardData;
  /** The viewer's user id; empty on the public spectate/embed views. */
  viewerUserId: string;
  /** The strip's button, or `null` for no strip (see `liveBoardStripAction`). */
  strip: LiveBoardStripAction | null;
  backHref: string;
  /** The `<ol>`'s test id — the e2e golden path reads the stableford board by it. */
  testId: 'stableford-leaderboard' | 'strokeplay-leaderboard';
  /**
   * Heiagjengen (#2286), the live link only: its token. Set, the name plates
   * link to the follow page (`followHref`) and the card «Hvem heier du på?»
   * stands above the board.
   */
  followToken?: string;
}

/**
 * The live board. Solo (stableford and strokeplay, #2253) is the default; the
 * team formats (scramble, team stableford, shamble, best ball; #2316) pass
 * `kind: 'team'` and get `TeamBoard`'s rows under the same header and strip.
 */
export type LiveBoardProps = SoloBoardProps | TeamBoardProps;

export function LiveBoard(props: LiveBoardProps): JSX.Element {
  return props.kind === 'team' ? <TeamBoard {...props} /> : <SoloBoard {...props} />;
}

/**
 * Tavla (#2253): the live board for solo stableford and solo strokeplay — a
 * deep-forest header, a dark board with white plates in four columns, the
 * viewer's own row marked «DU», and a strip at the bottom with the viewer's
 * place and the way on («Hull 7» / «Lever scorekort»).
 *
 * All numbers come ready from `computeLiveBoard`; this component only lays them
 * out. Local state (show all, the open reaction row) has no `key` tied to the
 * data, so it survives the realtime `router.refresh()`.
 */
function SoloBoard({
  gameName,
  status,
  statusLabel,
  formatLabel,
  flights,
  board,
  viewerUserId,
  strip,
  backHref,
  testId,
  followToken,
}: SoloBoardProps): JSX.Element {
  const t = useTranslations('leaderboard.board');
  const tc = useTranslations('leaderboard.common');
  const tf = useTranslations('spectate.follow');
  const [showAll, setShowAll] = useState(false);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const { rows, unit } = board;
  const { visible, canCollapse } = visibleBoardRows(rows, viewerUserId, showAll, (r) => r.userId);

  const pill = status === 'scheduled' ? statusLabel : pillText(t, board.holesPlayed);
  const formatLine = [
    formatLabel,
    t('players', { count: rows.length }),
    ...(flights > 1 ? [t('flights', { count: flights })] : []),
  ].join(' · ');

  const standing = viewerUserId ? viewerStanding(board, viewerUserId) : null;
  const displayName = (row: LiveBoardRow) => boardDisplayName(row, tc);

  return (
    <div>
      {followToken && (
        <div
          data-testid="follow-pick"
          className="mb-3 rounded-2xl border border-border bg-surface px-3.5 py-3"
        >
          <p className="font-serif text-[18px] font-medium text-text">{tf('pickTitle')}</p>
          <p className="mt-0.5 text-[13px] text-muted">{tf('pickBody')}</p>
        </div>
      )}
      <BoardHeader
        backHref={backHref}
        live={status === 'active'}
        pill={pill}
        gameName={gameName}
        title={t('title')}
        formatLine={formatLine}
      />

      {rows.length === 0 ? (
        <p className="mt-12 text-center text-sm text-muted">{tc('noPlayersToShow')}</p>
      ) : (
        <>
          <div
            data-focus-surface="strong"
            className="mt-3 rounded-2xl bg-surface-strong p-2.5 dark:ring-1 dark:ring-border"
          >
            <div
              aria-hidden
              className={`${COLUMNS} px-0.5 pb-1.5 text-xs font-semibold text-bg-tint`}
            >
              <span className="text-center">{t('colPlace')}</span>
              <span>{t('colPlayer')}</span>
              <span className="text-center">{t('colHoles')}</span>
              <span className="text-center">{columnHeading(t, unit)}</span>
            </div>
            <ol data-testid={testId} className="flex flex-col gap-1.5">
              {visible.map((item) =>
                item === 'gap' ? (
                  <li
                    key="gap"
                    data-testid="board-gap"
                    aria-hidden
                    className="list-none text-center text-[15px] leading-none text-bg-tint"
                  >
                    …
                  </li>
                ) : (
                  <BoardRow
                    key={item.userId}
                    row={item}
                    unit={unit}
                    name={displayName(item)}
                    isYou={item.userId === viewerUserId}
                    showRank={boardShowsPlace(board)}
                    followHref={followToken ? followHref(followToken, item.userId) : undefined}
                    open={openUserId === item.userId}
                    onToggle={() =>
                      setOpenUserId((cur) => (cur === item.userId ? null : item.userId))
                    }
                  />
                ),
              )}
            </ol>
          </div>

          <BoardLegend />

          {canCollapse && (
            <button
              type="button"
              data-testid="board-toggle"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
              className="mt-2.5 h-11 w-full rounded-xl border border-border bg-surface text-[13px] font-semibold text-primary"
            >
              {showAll ? t('showFewer') : t('showAll', { count: rows.length })}
            </button>
          )}
        </>
      )}

      {strip && standing && (
        <Strip
          strip={strip}
          standing={standing}
          unit={unit}
          rows={rows}
          displayName={displayName}
          leagueFlight={board.leagueFlight === true}
        />
      )}
    </div>
  );
}

function BoardRow({
  row,
  unit,
  name,
  isYou,
  showRank,
  followHref,
  open,
  onToggle,
}: {
  row: LiveBoardRow;
  unit: LiveBoardUnit;
  name: string;
  isYou: boolean;
  showRank: boolean;
  /** The live link's `?folg=` for this row (#2286). */
  followHref?: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('leaderboard.board');
  const tc = useTranslations('leaderboard.common');
  const tf = useTranslations('spectate.follow');
  // #2712: no leader's gold where the board shows no place (`boardShowsPlace`).
  const leader = showRank && isBoardLeader(row);
  // Klubbhus-natt: primary-soft sits one step from the surface, so the
  // viewer's row also gets a sage hairline there.
  const fill = isYou ? 'bg-primary-soft dark:ring-1 dark:ring-inset dark:ring-primary/60' : 'bg-surface';
  const plate = `${fill} rounded-md text-text`;
  const rankLabel = placeLabel(t, row, showRank);
  const panelId = `board-reactions-${row.userId}`;

  return (
    <li
      className="list-none"
      data-testid="board-row"
      data-user-id={row.userId}
      data-rank={row.rank}
      data-you={isYou || undefined}
    >
      <div className={COLUMNS}>
        <span
          aria-hidden
          data-testid="board-place"
          data-leader={(leader && showRank) || undefined}
          className={`${plate} ${PLATE_SHADOW} flex items-center justify-center`}
        >
          {leader && showRank ? (
            <span className="score-num grid h-7 w-7 place-items-center rounded-full bg-accent text-[15px] font-semibold text-surface-strong">
              {rankLabel}
            </span>
          ) : (
            <span className="score-num text-[18px] font-semibold">{rankLabel}</span>
          )}
        </span>
        <BoardPlayerPlate
          userId={row.userId}
          label={t('reactionsTo', { name })}
          follow={followHref ? { href: followHref, label: tf('followName', { name }) } : undefined}
          expanded={open}
          onToggle={onToggle}
          controls={panelId}
          className={`${plate} ${leader ? LEADER_PLATE_SHADOW : PLATE_SHADOW} px-2.5 py-2`}
          top={
            <>
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-[15px] font-semibold">{name}</span>
                {isYou && (
                  <span className="shrink-0 text-xs font-semibold text-primary">
                    {t('you')}
                  </span>
                )}
              </span>
              <Movement movement={row.movement} />
            </>
          }
          bottom={
            <span aria-hidden className="flex gap-1">
              {row.recent.map((tone, i) => (
                <span
                  key={i}
                  data-testid="board-dot"
                  data-tone={tone}
                  className={`h-2 w-2 rounded-full ${DOT[tone]}`}
                />
              ))}
            </span>
          }
        />
        <span
          aria-hidden
          data-testid="board-holes"
          className={`${plate} ${PLATE_SHADOW} score-num flex items-center justify-center text-[18px]`}
        >
          {row.holesPlayed}
        </span>
        <span
          aria-hidden
          data-testid="board-total"
          className={`${plate} ${PLATE_SHADOW} score-num flex items-center justify-center text-[24px] font-semibold text-primary`}
        >
          {totalLabel(unit, row.total)}
        </span>
      </div>
      <span className="sr-only">{boardRowSr(t, tc, { row, unit, showRank, isYou })}</span>
      {open && (
        <div id={panelId} className="mt-1.5 rounded-md bg-surface px-2 py-1">
          <RowReactionsForPlayer targetUserId={row.userId} />
        </div>
      )}
    </li>
  );
}

function Strip({
  strip,
  standing,
  unit,
  rows,
  displayName,
  leagueFlight,
}: {
  strip: LiveBoardStripAction;
  standing: ViewerStanding;
  unit: LiveBoardUnit;
  rows: LiveBoardRow[];
  displayName: (row: LiveBoardRow) => string;
  /** #2712: a league flight says the score, not a place. */
  leagueFlight: boolean;
}) {
  const t = useTranslations('leaderboard.board');
  const place = standing.tied
    ? t('stripTiedPlace', { rank: standing.rank })
    : t('stripPlace', { rank: standing.rank });

  const behind = behindLeaderText(t, standing, unit, rows, displayName);

  return (
    <StripFrame
      kicker={t('stripKicker')}
      text={leagueFlight ? totalSr(t, unit, standing.total) : [place, behind].filter(Boolean).join(' · ')}
      action={strip}
      rank={standing.rank}
      gap={standing.gap}
    />
  );
}
