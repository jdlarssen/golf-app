// The live board's text rules (#2253), in one home so the board, the follow
// page (#2286) and the big screen (#2275) word a row the same way: the place,
// the total, the leader test, the name, «N poeng bak Marte», the screen-reader
// line and how the board collapses. Pure functions; the components pass their
// own translators in.

import type { useTranslations } from 'next-intl';
import { firstName, sharesFirstName } from '@/lib/firstName';
import { formatRevealName } from '@/lib/names/formatRevealName';
import type {
  LiveBoardRow,
  LiveBoardUnit,
  ViewerStanding,
} from '@/lib/leaderboard/liveBoard';
import { formatVsPar } from '@/lib/leaderboard/vsPar';
import type { ScoreTone } from '@/lib/scoring/scoreTone';

export type BoardT = ReturnType<typeof useTranslations<'leaderboard.board'>>;
export type BoardCommonT = ReturnType<typeof useTranslations<'leaderboard.common'>>;
export type FollowT = ReturnType<typeof useTranslations<'spectate.follow'>>;

/** Rows shown before «Vis alle»; a field of up to `SHOW_ALL_UP_TO` shows everyone. */
export const COLLAPSED_ROWS = 5;
export const SHOW_ALL_UP_TO = 6;

/**
 * The rows the board shows. Collapsed, the top five — and when the focused
 * row (the viewer's own, or the followed player's) sits lower, a `'gap'` and
 * that row after them.
 */
export function visibleBoardRows(
  rows: LiveBoardRow[],
  focusUserId: string | null,
  showAll: boolean,
): { visible: (LiveBoardRow | 'gap')[]; canCollapse: boolean } {
  const canCollapse = rows.length > SHOW_ALL_UP_TO;
  const focusIndex = focusUserId ? rows.findIndex((r) => r.userId === focusUserId) : -1;
  const visible: (LiveBoardRow | 'gap')[] =
    !canCollapse || showAll
      ? rows
      : focusIndex >= COLLAPSED_ROWS
        ? [...rows.slice(0, COLLAPSED_ROWS), 'gap', rows[focusIndex]]
        : rows.slice(0, COLLAPSED_ROWS);
  return { visible, canCollapse };
}

/** Places show once anyone has played a hole; before that every row says «–». */
export function boardShowsRank(holesPlayed: number): boolean {
  return holesPlayed !== 0;
}

/** The live pill: «Live», or «Live · etter 7 hull» once anyone has played. */
export function pillText(t: BoardT, holesPlayed: number | null): string {
  return holesPlayed === null || holesPlayed === 0
    ? t('pillLive')
    : t('pillLiveAfter', { holes: holesPlayed });
}

/** The leader's row: first place, and at least one hole played. */
export function isBoardLeader(row: LiveBoardRow): boolean {
  return row.rank === 1 && row.holesPlayed > 0;
}

/** The player's name as the board shows it, with the unknown-player fallback. */
export function boardDisplayName(row: LiveBoardRow, tc: BoardCommonT): string {
  return row.name ? formatRevealName(row.name, row.nickname) : tc('unknownPlayerFull');
}

/** «–» before anyone has played, «T2» on a shared place, else the place. */
export function placeLabel(t: BoardT, row: LiveBoardRow, showRank: boolean): string {
  return !showRank ? '–' : row.tied ? t('tiedRank', { rank: row.rank }) : String(row.rank);
}

/** The board's number: points, net strokes, or net to par («−2», «E»). */
export function totalLabel(unit: LiveBoardUnit, total: number | null): string {
  if (total === null) return '—';
  return unit === 'toPar' ? formatVsPar(total) : String(total);
}

/** The follow page's big total (#2286): «26 p», «−2» or «74 netto». */
export function followTotalLabel(tf: FollowT, unit: LiveBoardUnit, total: number | null): string {
  if (total === null) return '—';
  if (unit === 'points') return tf('totalPoints', { total });
  if (unit === 'toPar') return formatVsPar(total);
  return tf('totalNet', { total });
}

export function totalSr(t: BoardT, unit: LiveBoardUnit, total: number | null): string {
  if (total === null) return t('srNoTotal');
  if (unit === 'points') return t('srPoints', { total });
  if (unit === 'net') return t('srNet', { total });
  if (total === 0) return t('srEven');
  return total > 0 ? t('srOverPar', { count: total }) : t('srUnderPar', { count: -total });
}

export function toneKey(tone: ScoreTone): 'under' | 'par' | 'over1' | 'over2' {
  return tone === 'unset' ? 'par' : tone;
}

/** The screen-reader line for one board row. */
export function boardRowSr(
  t: BoardT,
  tc: BoardCommonT,
  opts: { row: LiveBoardRow; unit: LiveBoardUnit; showRank: boolean; isYou: boolean },
): string {
  const { row, unit, showRank, isYou } = opts;
  return [
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
  ]
    .filter(Boolean)
    .join('. ');
}

/**
 * A player's name inside a sentence («2 poeng bak Marte», «Marte tok
 * ledelsen»): the first name, or the full name when another player on the
 * board shares it (#2286). One rule for the strip and the big screen's
 * «Siste nytt» (#2275).
 */
export function sentenceName(
  row: LiveBoardRow,
  rows: readonly LiveBoardRow[],
  displayName: (row: LiveBoardRow) => string,
): string {
  const others = rows.filter((r) => r.userId !== row.userId).map((r) => r.name);
  return sharesFirstName(row.name, others) ? displayName(row) : (firstName(row.name) ?? displayName(row));
}

/**
 * «2 poeng bak Marte», or «2 poeng bak ledelsen» on a shared lead; `null` when
 * the player leads or the numbers cannot be compared. The leader is named by
 * first name, or in full when another player on the board shares it.
 */
export function behindLeaderText(
  t: BoardT,
  standing: ViewerStanding,
  unit: LiveBoardUnit,
  rows: LiveBoardRow[],
  displayName: (row: LiveBoardRow) => string,
): string | null {
  if (standing.gap === null || standing.gap <= 0) return null;
  const inPoints = unit === 'points';
  if (standing.leaderUserIds.length > 1) {
    return inPoints
      ? t('behindPointsLead', { gap: standing.gap })
      : t('behindStrokesLead', { gap: standing.gap });
  }
  const leaderRow = rows.find((r) => r.userId === standing.leaderUserIds[0]);
  const leader = leaderRow ? sentenceName(leaderRow, rows, displayName) : '';
  return inPoints
    ? t('behindPoints', { gap: standing.gap, name: leader })
    : t('behindStrokes', { gap: standing.gap, name: leader });
}
