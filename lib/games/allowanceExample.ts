/**
 * #2455: what the handicap share does to the group, in strokes, before the
 * game is published: «Marte (HCP 18,4) 19 slag i stedet for 22».
 *
 * Shows the player with the highest and the player with the lowest handicap
 * index, highest first (as `Nyttspill-forslag-hcp-eksempel` draws it). Each
 * number is `playingHandicap`, the same pipeline `startScheduledGame`
 * freezes into `game_players.course_handicap`, on the rating set of the
 * player's own tee category. The wizard never sets a stroke cap, so none is
 * applied.
 *
 * Pure, no server imports: the wizard calls it on every render of the
 * «Handicap» sheet.
 */
import { playingHandicap } from '@/lib/scoring/courseHandicap';
import { getRatingForGender, type TeeBoxRatings, type TeeGender } from './teeRating';

export type AllowanceExamplePlayer = {
  id: string;
  /** Already formatted for display (short name or the pending fallback). */
  name: string;
  hcpIndex: number;
  /** The category the player is sent with (`game_players.tee_gender`). */
  gender: TeeGender;
};

export type AllowanceExampleRow = {
  playerId: string;
  name: string;
  hcpIndex: number;
  /** Course handicap at the chosen share. */
  strokes: number;
  /** Course handicap at 100 %. */
  strokesAtFull: number;
};

export type AllowanceExample = {
  teeName: string;
  rows: AllowanceExampleRow[];
};

/**
 * `null` when there is nothing to show: no tee, no ratings on it, or no
 * selected player whose category the tee rates. A player the tee does not
 * rate is left out, so the others still show.
 *
 * Ties: the first player in selected order with the lowest index, then the
 * first other one with the highest.
 */
export function allowanceExample({
  players,
  tee,
  pct,
}: {
  players: readonly AllowanceExamplePlayer[];
  tee: { name: string; ratings?: TeeBoxRatings | null } | null;
  pct: number;
}): AllowanceExample | null {
  const ratings = tee?.ratings;
  if (!tee || !ratings) return null;

  const rows: AllowanceExampleRow[] = [];
  for (const p of players) {
    const rating = getRatingForGender(ratings, p.gender);
    if (!rating) continue;
    const at = (allowancePct: number) =>
      playingHandicap({ hcpIndex: p.hcpIndex, ...rating, allowancePct });
    const strokes = at(pct);
    const strokesAtFull = at(100);
    if (strokes === null || strokesAtFull === null) continue;
    rows.push({
      playerId: p.id,
      name: p.name,
      hcpIndex: p.hcpIndex,
      // A plus handicap can round to -0; it reads «0 slag».
      strokes: strokes === 0 ? 0 : strokes,
      strokesAtFull: strokesAtFull === 0 ? 0 : strokesAtFull,
    });
  }
  if (rows.length === 0) return null;

  let lowest = rows[0];
  for (const r of rows) if (r.hcpIndex < lowest.hcpIndex) lowest = r;
  const others = rows.filter((r) => r !== lowest);
  if (others.length === 0) return { teeName: tee.name, rows: [lowest] };
  let highest = others[0];
  for (const r of others) if (r.hcpIndex > highest.hcpIndex) highest = r;

  // Highest first. Equal indexes keep the selected order: `lowest` is the
  // first of them, so it already comes before `highest`.
  const pair = highest.hcpIndex > lowest.hcpIndex ? [highest, lowest] : [lowest, highest];
  return { teeName: tee.name, rows: pair };
}
