// The board's text-free rules (#2253, moved here in #2579): how it collapses,
// when places show, who leads, the place kind, the number, a name inside a
// sentence and the order of a row read aloud. One home for the web board, the follow page, the big screen and
// the app (native/app never imports from app/). The web's `t()` wrappers stay
// in `app/[locale]/games/[id]/leaderboard/boardText.ts`.
//
// The rules are structural, so a team row («Lag 4», keyed on its team number)
// goes through the same rule as a player row (keyed on its userId).

import { firstName, sharesFirstName } from '@/lib/firstName';
import { isToParUnit, type LiveBoardRow, type LiveBoardUnit } from '@/lib/leaderboard/liveBoard';
import { formatVsPar } from '@/lib/leaderboard/vsPar';
import type { ScoreTone } from '@/lib/scoring/scoreTone';

/** What tells two rows apart: a player's userId, a team's number. */
export type BoardRowKey = string | number;

/** The fields the place and leader rules read. */
export type BoardPlaceRow = Pick<LiveBoardRow, 'rank' | 'tied' | 'holesPlayed'>;

/** Rows shown before «Vis alle»; a field of up to `SHOW_ALL_UP_TO` shows everyone. */
export const COLLAPSED_ROWS = 5;
export const SHOW_ALL_UP_TO = 6;

/**
 * The rows the board shows. Collapsed, the top five — and when the focused
 * row (the viewer's own, or the followed player's) sits lower, a `'gap'` and
 * that row after them.
 */
export function visibleBoardRows<Row>(
  rows: readonly Row[],
  focusKey: BoardRowKey | null,
  showAll: boolean,
  keyOf: (row: Row) => BoardRowKey,
): { visible: (Row | 'gap')[]; canCollapse: boolean } {
  const canCollapse = rows.length > SHOW_ALL_UP_TO;
  const focusIndex = focusKey === null ? -1 : rows.findIndex((r) => keyOf(r) === focusKey);
  const visible: (Row | 'gap')[] =
    !canCollapse || showAll
      ? [...rows]
      : focusIndex >= COLLAPSED_ROWS
        ? [...rows.slice(0, COLLAPSED_ROWS), 'gap', rows[focusIndex]]
        : rows.slice(0, COLLAPSED_ROWS);
  return { visible, canCollapse };
}

/** Places show once anyone has played a hole; before that every row says «–». */
export function boardShowsRank(holesPlayed: number): boolean {
  return holesPlayed !== 0;
}

/** The leader's row: first place, and at least one hole played. */
export function isBoardLeader(row: BoardPlaceRow): boolean {
  return row.rank === 1 && row.holesPlayed > 0;
}

/** «–» before anyone has played (`none`), «T2» on a shared place (`tied`), else the place. */
export function placeKind(row: BoardPlaceRow, showRank: boolean): 'none' | 'tied' | 'plain' {
  return !showRank ? 'none' : row.tied ? 'tied' : 'plain';
}

/** The board's number: points, net strokes, or against par («−2», «E», #2625 «+3» in points). */
export function totalLabel(unit: LiveBoardUnit, total: number | null): string {
  if (total === null) return '—';
  return isToParUnit(unit) ? formatVsPar(total) : String(total);
}

export function toneKey(tone: ScoreTone): 'under' | 'par' | 'over1' | 'over2' {
  return tone === 'unset' ? 'par' : tone;
}

/**
 * A row's name inside a sentence («2 poeng bak Marte», «Marte tok
 * ledelsen», «Likt med Lag 4»): the first name, or the full name when another
 * row on the board shares it (#2286). The teams on a board all share «Lag»,
 * so a team is named in full («Lag 4»). One rule for the strip, the finished
 * board and the big screen's «Siste nytt» (#2275).
 */
export function sentenceName<Row extends { name: string | null }>(
  row: Row,
  rows: readonly Row[],
  displayName: (row: Row) => string,
  keyOf: (row: Row) => BoardRowKey,
): string {
  const key = keyOf(row);
  const others = rows.filter((r) => keyOf(r) !== key).map((r) => r.name);
  return sharesFirstName(row.name, others) ? displayName(row) : (firstName(row.name) ?? displayName(row));
}

/** The number in a spoken line, by kind; each surface words it. */
export type BoardTotalSr =
  | { kind: 'none' }
  | { kind: 'points'; value: number }
  | { kind: 'net'; value: number }
  | { kind: 'even' }
  | { kind: 'over'; value: number }
  | { kind: 'under'; value: number }
  | { kind: 'pointsOver'; value: number }
  | { kind: 'pointsUnder'; value: number };

/**
 * «18 poeng», «74 slag netto», «På par», «2 over par», or no total yet.
 * #2625: points against par pace say the points («3 poeng over par»), since
 * over par is the good side there.
 */
export function boardTotalSr(unit: LiveBoardUnit, total: number | null): BoardTotalSr {
  if (total === null) return { kind: 'none' };
  if (unit === 'points') return { kind: 'points', value: total };
  if (unit === 'net') return { kind: 'net', value: total };
  if (total === 0) return { kind: 'even' };
  if (unit === 'pointsToPar') {
    return total > 0 ? { kind: 'pointsOver', value: total } : { kind: 'pointsUnder', value: -total };
  }
  return total > 0 ? { kind: 'over', value: total } : { kind: 'under', value: -total };
}

export type BoardRowSrPart =
  | { key: 'place'; rank: number; tied: boolean }
  | { key: 'winner' }
  | { key: 'total'; total: BoardTotalSr }
  | { key: 'movement'; direction: 'up' | 'down' | 'same'; count: number }
  | { key: 'recent'; tones: ('under' | 'par' | 'over1' | 'over2')[] }
  | { key: 'holes'; count: number }
  | { key: 'note' }
  | { key: 'you' };

/**
 * A board row read aloud, in order (#2253, one home since #2579): the place
 * (once anyone has played), «Vinner» on a finished board, the number, the
 * movement, the last holes, holes played, a finished board's tie note, and
 * «you». The web's `boardRowSr` and the app's row label word the parts.
 */
export function boardRowSrParts(opts: {
  row: Pick<LiveBoardRow, 'rank' | 'tied' | 'total' | 'holesPlayed' | 'movement' | 'recent'>;
  unit: LiveBoardUnit;
  showRank: boolean;
  isYou: boolean;
  winner?: boolean;
  hasNote?: boolean;
}): BoardRowSrPart[] {
  const { row, unit, showRank, isYou, winner = false, hasNote = false } = opts;
  const parts: BoardRowSrPart[] = [];
  if (showRank) parts.push({ key: 'place', rank: row.rank, tied: row.tied });
  if (winner) parts.push({ key: 'winner' });
  parts.push({ key: 'total', total: boardTotalSr(unit, row.total) });
  if (row.movement !== null) {
    parts.push({
      key: 'movement',
      direction: row.movement > 0 ? 'up' : row.movement < 0 ? 'down' : 'same',
      count: Math.abs(row.movement),
    });
  }
  if (row.recent.length > 0) parts.push({ key: 'recent', tones: row.recent.map(toneKey) });
  parts.push({ key: 'holes', count: row.holesPlayed });
  if (hasNote) parts.push({ key: 'note' });
  if (isYou) parts.push({ key: 'you' });
  return parts;
}
