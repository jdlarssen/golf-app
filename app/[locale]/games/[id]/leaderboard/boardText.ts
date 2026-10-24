// The live board's wording (#2253), in one home so the board, the follow
// page (#2286) and the big screen (#2275) word a row the same way: the pill,
// the place, the name, «N poeng bak Marte» and the screen-reader line. Pure
// functions; the components pass their own translators in. The text-free
// rules they build on (collapsing, the leader, the place kind, the number, a
// name inside a sentence) live in `lib/leaderboard/boardRules.ts` (#2579).

import type { useTranslations } from 'next-intl';
import { formatRevealName } from '@/lib/names/formatRevealName';
import {
  boardRowSrParts,
  boardTotalSr,
  placeKind,
  sentenceName,
  type BoardPlaceRow,
  type BoardRowSrPart,
  type BoardTotalSr,
} from '@/lib/leaderboard/boardRules';
import {
  isPointsUnit,
  isToParUnit,
  type LiveBoardRow,
  type LiveBoardUnit,
  type ViewerStanding,
} from '@/lib/leaderboard/liveBoard';
import { formatVsPar } from '@/lib/leaderboard/vsPar';

export type BoardT = ReturnType<typeof useTranslations<'leaderboard.board'>>;
export type BoardCommonT = ReturnType<typeof useTranslations<'leaderboard.common'>>;
export type FollowT = ReturnType<typeof useTranslations<'spectate.follow'>>;

/** The live pill: «Live», or «Live · etter 7 hull» once anyone has played. */
export function pillText(t: BoardT, holesPlayed: number | null): string {
  return holesPlayed === null || holesPlayed === 0
    ? t('pillLive')
    : t('pillLiveAfter', { holes: holesPlayed });
}

/** The player's name as the board shows it, with the unknown-player fallback. */
export function boardDisplayName(row: LiveBoardRow, tc: BoardCommonT): string {
  return row.name ? formatRevealName(row.name, row.nickname) : tc('unknownPlayerFull');
}

/** «–» before anyone has played, «T2» on a shared place, else the place. */
export function placeLabel(t: BoardT, row: BoardPlaceRow, showRank: boolean): string {
  const kind = placeKind(row, showRank);
  return kind === 'none' ? '–' : kind === 'tied' ? t('tiedRank', { rank: row.rank }) : String(row.rank);
}

/**
 * The number column's heading: «Poeng», or «Netto» over net strokes and net
 * to par («netto −2», #2253). #2625: points against par pace say «Mot par» —
 * «Poeng» over «+3» would read as three points.
 */
export function columnHeading(t: BoardT, unit: LiveBoardUnit): string {
  if (unit === 'pointsToPar') return t('colVsPar');
  return unit === 'points' ? t('colPoints') : t('colNet');
}

/** The follow page's big total (#2286): «26 p», «−2» or «74 netto» (#2625: «+3» in points against par pace). */
export function followTotalLabel(tf: FollowT, unit: LiveBoardUnit, total: number | null): string {
  if (total === null) return '—';
  if (isToParUnit(unit)) return formatVsPar(total);
  if (unit === 'points') return tf('totalPoints', { total });
  return tf('totalNet', { total });
}

function totalSrText(t: BoardT, total: BoardTotalSr): string {
  switch (total.kind) {
    case 'none':
      return t('srNoTotal');
    case 'points':
      return t('srPoints', { total: total.value });
    case 'net':
      return t('srNet', { total: total.value });
    case 'even':
      return t('srEven');
    case 'over':
      return t('srOverPar', { count: total.value });
    case 'under':
      return t('srUnderPar', { count: total.value });
    case 'pointsOver':
      return t('srPointsOverPar', { count: total.value });
    case 'pointsUnder':
      return t('srPointsUnderPar', { count: total.value });
  }
}

export function totalSr(t: BoardT, unit: LiveBoardUnit, total: number | null): string {
  return totalSrText(t, boardTotalSr(unit, total));
}

/** One part of a row's spoken line in the web's words; the order is `boardRowSrParts`. */
function rowSrPartText(t: BoardT, tc: BoardCommonT, part: BoardRowSrPart): string | null {
  switch (part.key) {
    case 'place':
      return part.tied ? t('srTiedPlace', { rank: part.rank }) : t('srPlace', { rank: part.rank });
    case 'total':
      return totalSrText(t, part.total);
    case 'movement':
      return part.direction === 'up'
        ? t('srUp', { count: part.count })
        : part.direction === 'down'
          ? t('srDown', { count: part.count })
          : t('srSame');
    case 'recent':
      return t('srRecent', { tones: part.tones.map((tone) => t(`tone.${tone}`)).join(', ') });
    case 'holes':
      return tc('holesPlayedCount', { count: part.count });
    case 'you':
      return t('srYou');
    // The live web board has no winner or tie note.
    case 'winner':
    case 'note':
      return null;
  }
}

/** The screen-reader line for one board row. */
export function boardRowSr(
  t: BoardT,
  tc: BoardCommonT,
  opts: { row: LiveBoardRow; unit: LiveBoardUnit; showRank: boolean; isYou: boolean },
): string {
  return boardRowSrParts(opts)
    .map((part) => rowSrPartText(t, tc, part))
    .filter(Boolean)
    .join('. ');
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
  const inPoints = isPointsUnit(unit);
  if (standing.leaderUserIds.length > 1) {
    return inPoints
      ? t('behindPointsLead', { gap: standing.gap })
      : t('behindStrokesLead', { gap: standing.gap });
  }
  const leaderRow = rows.find((r) => r.userId === standing.leaderUserIds[0]);
  const leader = leaderRow ? sentenceName(leaderRow, rows, displayName, (r) => r.userId) : '';
  return inPoints
    ? t('behindPoints', { gap: standing.gap, name: leader })
    : t('behindStrokes', { gap: standing.gap, name: leader });
}
