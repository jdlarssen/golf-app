'use client';

import { useState, type JSX } from 'react';
import { useTranslations } from 'next-intl';
import { LeaderboardBackLink } from '@/components/ui/LeaderboardBackLink';
import { SmartLink } from '@/components/ui/SmartLink';
import { firstName } from '@/lib/firstName';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  viewerStanding,
  type LiveBoard as LiveBoardData,
  type LiveBoardRow,
  type LiveBoardStripAction,
  type LiveBoardUnit,
  type ViewerStanding,
} from '@/lib/leaderboard/liveBoard';
import { formatVsPar } from '@/lib/leaderboard/vsPar';
import type { ScoreTone } from '@/lib/scoring/scoreTone';
import { BoardPlayerPlate } from './BoardRowReactions';
import { RowReactionsForPlayer } from './RowReactionsForPlayer';

/** Rows shown before «Vis alle»; a field of up to `SHOW_ALL_UP_TO` shows everyone. */
const COLLAPSED_ROWS = 5;
const SHOW_ALL_UP_TO = 6;

/** PLASS · SPILLER · HULL · POENG — one grid for the headings and every row. */
const COLUMNS = 'grid grid-cols-[44px_minmax(0,1fr)_46px_58px] gap-1.5';

/** A white plate on the board, pressed in at the bottom. */
const PLATE_SHADOW = 'shadow-[inset_0_-2px_0_rgba(0,0,0,0.08)]';
/** The leader's SPILLER plate: the same, plus a gold hairline. */
const LEADER_PLATE_SHADOW =
  'shadow-[inset_0_-2px_0_rgba(0,0,0,0.08),inset_0_0_0_1px_var(--accent)]';

const DOT: Record<ScoreTone, string> = {
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

export interface LiveBoardProps {
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
}

/**
 * Tavla (#2253): the live board for solo stableford and solo strokeplay — a
 * deep-forest header, a dark board with white plates in four columns, the
 * viewer's own row marked «DU», and a strip at the bottom with the viewer's
 * place and the way on («Hull 7 →» / «Lever scorekort →»).
 *
 * All numbers come ready from `computeLiveBoard`; this component only lays them
 * out. Local state (show all, the open reaction row) has no `key` tied to the
 * data, so it survives the realtime `router.refresh()`.
 */
export function LiveBoard({
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
}: LiveBoardProps): JSX.Element {
  const t = useTranslations('leaderboard.board');
  const tc = useTranslations('leaderboard.common');
  const [showAll, setShowAll] = useState(false);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const { rows, unit } = board;
  const nobodyHasPlayed = board.holesPlayed === 0;
  const canCollapse = rows.length > SHOW_ALL_UP_TO;
  const viewerIndex = viewerUserId ? rows.findIndex((r) => r.userId === viewerUserId) : -1;

  const visible: (LiveBoardRow | 'gap')[] =
    !canCollapse || showAll
      ? rows
      : viewerIndex >= COLLAPSED_ROWS
        ? [...rows.slice(0, COLLAPSED_ROWS), 'gap', rows[viewerIndex]]
        : rows.slice(0, COLLAPSED_ROWS);

  const pill =
    status === 'scheduled'
      ? statusLabel
      : nobodyHasPlayed
        ? t('pillLive')
        : t('pillLiveAfter', { holes: board.holesPlayed });
  const formatLine = [
    formatLabel,
    t('players', { count: rows.length }),
    ...(flights > 1 ? [t('flights', { count: flights })] : []),
  ].join(' · ');

  const standing = viewerUserId ? viewerStanding(board, viewerUserId) : null;
  const displayName = (row: LiveBoardRow) =>
    row.name ? formatRevealName(row.name, row.nickname) : tc('unknownPlayerFull');

  return (
    <div>
      <header
        data-focus-surface="strong"
        className="rounded-2xl bg-surface-strong px-2 pt-2 pb-5 text-bg-tint"
      >
        <div className="flex items-center justify-between gap-3">
          <LeaderboardBackLink href={backHref} label={tc('backAriaLabel')} tone="onStrong" />
          <span
            data-testid="board-pill"
            className="mr-2 inline-flex items-center gap-1.5 rounded-full border border-bg-tint/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] tabular-nums"
          >
            {status === 'active' && (
              <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
            )}
            {pill}
          </span>
        </div>
        <div className="px-3">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-bg-tint/80">
            {gameName}
          </p>
          <h1 className="mt-1 font-serif text-[40px] font-semibold leading-[1.05]">
            {t('title')}
          </h1>
          <p className="mt-0.5 text-[13px] tabular-nums text-bg-tint/85">{formatLine}</p>
        </div>
      </header>

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
              className={`${COLUMNS} px-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-bg-tint`}
            >
              <span className="text-center">{t('colPlace')}</span>
              <span>{t('colPlayer')}</span>
              <span className="text-center">{t('colHoles')}</span>
              <span className="text-center">
                {unit === 'points' ? t('colPoints') : t('colNet')}
              </span>
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
                    showRank={!nobodyHasPlayed}
                    open={openUserId === item.userId}
                    onToggle={() =>
                      setOpenUserId((cur) => (cur === item.userId ? null : item.userId))
                    }
                  />
                ),
              )}
            </ol>
          </div>

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
        <Strip strip={strip} standing={standing} unit={unit} rows={rows} displayName={displayName} />
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
  open,
  onToggle,
}: {
  row: LiveBoardRow;
  unit: LiveBoardUnit;
  name: string;
  isYou: boolean;
  showRank: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('leaderboard.board');
  const tc = useTranslations('leaderboard.common');
  const leader = row.rank === 1 && row.holesPlayed > 0;
  const fill = isYou ? 'bg-primary-soft' : 'bg-surface';
  const plate = `${fill} rounded-md text-text`;
  const rankLabel = !showRank ? '–' : row.tied ? t('tiedRank', { rank: row.rank }) : String(row.rank);
  const panelId = `board-reactions-${row.userId}`;

  const srParts = [
    !showRank ? null : row.tied ? t('srTiedPlace', { rank: row.rank }) : t('srPlace', { rank: row.rank }),
    totalSr(t, unit, row.total),
    row.movement === null
      ? null
      : row.movement > 0
        ? t('srUp', { count: row.movement })
        : row.movement < 0
          ? t('srDown', { count: -row.movement })
          : t('srSame'),
    row.recent.length > 0
      ? t('srRecent', { tones: row.recent.map((tone) => t(`tone.${toneKey(tone)}`)).join(', ') })
      : null,
    tc('holesPlayedCount', { count: row.holesPlayed }),
    isYou ? t('srYou') : null,
  ].filter(Boolean);

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
          expanded={open}
          onToggle={onToggle}
          controls={panelId}
          className={`${plate} ${leader ? LEADER_PLATE_SHADOW : PLATE_SHADOW} px-2.5 py-2`}
          top={
            <>
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate text-[15px] font-semibold">{name}</span>
                {isYou && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
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
      <span className="sr-only">{srParts.join('. ')}</span>
      {open && (
        <div id={panelId} className="mt-1.5 rounded-md bg-surface px-2 py-1">
          <RowReactionsForPlayer targetUserId={row.userId} />
        </div>
      )}
    </li>
  );
}

function Movement({ movement }: { movement: number | null }) {
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

function Strip({
  strip,
  standing,
  unit,
  rows,
  displayName,
}: {
  strip: LiveBoardStripAction;
  standing: ViewerStanding;
  unit: LiveBoardUnit;
  rows: LiveBoardRow[];
  displayName: (row: LiveBoardRow) => string;
}) {
  const t = useTranslations('leaderboard.board');
  const place = standing.tied
    ? t('stripTiedPlace', { rank: standing.rank })
    : t('stripPlace', { rank: standing.rank });

  let behind: string | null = null;
  if (standing.gap !== null && standing.gap > 0) {
    const inPoints = unit === 'points';
    if (standing.leaderUserIds.length > 1) {
      behind = inPoints
        ? t('behindPointsLead', { gap: standing.gap })
        : t('behindStrokesLead', { gap: standing.gap });
    } else {
      const leaderRow = rows.find((r) => r.userId === standing.leaderUserIds[0]);
      const leader = leaderRow ? (firstName(leaderRow.name) ?? displayName(leaderRow)) : '';
      behind = inPoints
        ? t('behindPoints', { gap: standing.gap, name: leader })
        : t('behindStrokes', { gap: standing.gap, name: leader });
    }
  }

  return (
    <div
      data-testid="board-strip"
      data-rank={standing.rank}
      data-gap={standing.gap ?? undefined}
      className="sticky bottom-[calc(65px+env(safe-area-inset-bottom,0px))] z-20 mt-4"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 shadow-[0_6px_20px_rgba(26,46,31,0.10)]">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('stripKicker')}
          </p>
          <p className="mt-0.5 truncate font-serif text-[18px] font-medium tabular-nums text-text">
            {[place, behind].filter(Boolean).join(' · ')}
          </p>
        </div>
        {strip.kind !== 'none' && (
          <SmartLink
            data-testid="board-strip-action"
            data-kind={strip.kind}
            href={strip.href}
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-primary px-4 text-[14px] font-semibold text-white hover:bg-primary-hover dark:text-bg"
          >
            {strip.kind === 'hole'
              ? t('stripHole', { hole: strip.holeNumber })
              : t('stripSubmit')}
          </SmartLink>
        )}
      </div>
    </div>
  );
}

function totalLabel(unit: LiveBoardUnit, total: number | null): string {
  if (total === null) return '—';
  return unit === 'toPar' ? formatVsPar(total) : String(total);
}

type BoardT = ReturnType<typeof useTranslations<'leaderboard.board'>>;

function totalSr(t: BoardT, unit: LiveBoardUnit, total: number | null): string {
  if (total === null) return t('srNoTotal');
  if (unit === 'points') return t('srPoints', { total });
  if (unit === 'net') return t('srNet', { total });
  if (total === 0) return t('srEven');
  return total > 0 ? t('srOverPar', { count: total }) : t('srUnderPar', { count: -total });
}

function toneKey(tone: ScoreTone): 'under' | 'par' | 'over1' | 'over2' {
  return tone === 'unset' ? 'par' : tone;
}
