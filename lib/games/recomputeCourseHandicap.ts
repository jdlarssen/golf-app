import { getAdminClient } from '@/lib/supabase/admin';
import {
  calculateCourseHandicap,
  applyAllowance,
} from '@/lib/scoring/courseHandicap';
import { getRatingForGender, type TeeBoxRatings, type TeeGender } from './teeRating';
import type { GameStatus } from './status';

/**
 * One of the current player's game memberships, flattened into the inputs the
 * recompute rule needs: the game's status + allowance + tee rating-set, the
 * player's chosen gender, and the currently-frozen course handicap (or null if
 * the game hasn't started yet).
 */
export interface RecomputeGameRow {
  gameId: string;
  status: GameStatus;
  /** The frozen `game_players.course_handicap`; null before `startScheduledGame`. */
  courseHandicap: number | null;
  teeGender: TeeGender;
  /** The game tee's rating-sets, or null when the tee is missing. */
  teeRatings: TeeBoxRatings | null;
  /** `games.hcp_allowance_pct` — the format's stroke allowance. */
  allowancePct: number;
}

/** A single course-handicap write the recompute wants to apply. */
export interface RecomputeUpdate {
  gameId: string;
  courseHandicap: number;
}

/**
 * Pure recompute rule (#1176). Given a player's game memberships and their
 * *newly set* handicap index, decide which frozen course handicaps must be
 * rewritten and to what value.
 *
 * The #1176 soft profile gate lets a fresh invitee reach a game before setting
 * name/HCP. If they complete their profile *after* the game has already frozen
 * course handicaps (`startScheduledGame`), the placeholder hcp_index used at
 * freeze time leaves them with the wrong course handicap for the whole round.
 * This recomputes only the rows that genuinely need it:
 *
 *   - `active` games only — `finished` rounds are historical (never rewrite a
 *     result), and `scheduled`/`draft` games get their course handicap at start,
 *     from the by-then-correct hcp_index, so touching them is pointless.
 *   - `courseHandicap` already frozen (not null) — a null value means the game
 *     hasn't started; `startScheduledGame` will compute it fresh later.
 *   - the tee rating-set for the player's gender must resolve — otherwise there
 *     is no formula input, and we leave the existing value rather than null it.
 *
 * Composes the exact freeze pipeline (`calculateCourseHandicap` → `applyAllowance`)
 * so a recomputed value is identical to what `startScheduledGame` would have
 * frozen — no formula fork, no drift.
 */
export function planHandicapRecompute(
  rows: RecomputeGameRow[],
  newHcpIndex: number,
): RecomputeUpdate[] {
  if (!Number.isFinite(newHcpIndex)) return [];

  const updates: RecomputeUpdate[] = [];
  for (const row of rows) {
    if (row.status !== 'active') continue;
    if (row.courseHandicap === null) continue;
    if (!row.teeRatings) continue;
    const rating = getRatingForGender(row.teeRatings, row.teeGender);
    if (!rating) continue;

    const raw = calculateCourseHandicap({
      hcpIndex: newHcpIndex,
      slope: rating.slope,
      courseRating: rating.courseRating,
      par: rating.par,
    });
    updates.push({
      gameId: row.gameId,
      courseHandicap: applyAllowance(raw, row.allowancePct),
    });
  }
  return updates;
}

/**
 * Recompute + persist the current player's frozen course handicaps after a late
 * profile completion (#1176). Runs on the **admin client**: the 0107 immutability
 * trigger (`guard_game_players_self_update`) blocks a player from changing their
 * own `course_handicap` once the game is `active`/`finished`, so the request-scoped
 * client would silently no-op. Service-role writes bypass that trigger — the same
 * path `startScheduledGame` uses to freeze the value in the first place.
 *
 * In the normal flow this is a defensive ~0-row no-op: `startScheduledGame` refuses
 * to activate a game while any roster player is still profile-incomplete, so an
 * active game rarely holds a frozen CH for a pending-profile player. It exists to
 * keep the soft gate from ever becoming a scoring-correctness hole.
 *
 * Best-effort: never throws. Returns the number of rows actually rewritten so the
 * caller can log, but a failed lookup or write must never block onboarding.
 */
export async function recomputeCourseHandicapForUser(
  userId: string,
  newHcpIndex: number,
): Promise<{ updated: number }> {
  const admin = getAdminClient();

  const { data: memberships, error: membershipError } = await admin
    .from('game_players')
    .select('game_id, tee_gender, course_handicap')
    .eq('user_id', userId)
    .returns<
      { game_id: string; tee_gender: TeeGender; course_handicap: number | null }[]
    >();
  if (membershipError) {
    console.error('[recomputeCourseHandicap] membership lookup failed', membershipError);
    return { updated: 0 };
  }
  if (!memberships || memberships.length === 0) return { updated: 0 };

  const gameIds = [...new Set(memberships.map((m) => m.game_id))];
  const { data: games, error: gamesError } = await admin
    .from('games')
    .select(
      'id, status, hcp_allowance_pct, tee_boxes(slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
    )
    .in('id', gameIds)
    .returns<
      {
        id: string;
        status: GameStatus;
        hcp_allowance_pct: number;
        tee_boxes: TeeBoxRatings | null;
      }[]
    >();
  if (gamesError || !games) {
    console.error('[recomputeCourseHandicap] games lookup failed', gamesError);
    return { updated: 0 };
  }

  const gameById = new Map(games.map((g) => [g.id, g]));
  const rows: RecomputeGameRow[] = memberships.map((m) => {
    const game = gameById.get(m.game_id);
    return {
      gameId: m.game_id,
      status: game?.status ?? 'draft',
      courseHandicap: m.course_handicap,
      teeGender: m.tee_gender,
      teeRatings: game?.tee_boxes ?? null,
      allowancePct: game?.hcp_allowance_pct ?? 100,
    };
  });

  const updates = planHandicapRecompute(rows, newHcpIndex);
  let updated = 0;
  for (const update of updates) {
    const { data: affected, error: updateError } = await admin
      .from('game_players')
      .update({ course_handicap: update.courseHandicap })
      .eq('user_id', userId)
      .eq('game_id', update.gameId)
      .select('game_id');
    if (updateError) {
      console.error('[recomputeCourseHandicap] update failed', updateError);
      continue;
    }
    updated += affected?.length ?? 0;
  }
  return { updated };
}
