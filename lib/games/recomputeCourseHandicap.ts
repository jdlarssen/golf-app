import { revalidateTag } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  calculateCourseHandicap,
  applyAllowance,
} from '@/lib/scoring/courseHandicap';
import { greensomeTeamHandicap } from '@/lib/scoring/modes/greensomeMatchplay';
import {
  readStoredTeamStrokesOverride,
  type TeamStrokesOverride,
} from './greensomeOverridePlan';
import { getRatingForGender, type TeeBoxRatings, type TeeGender } from './teeRating';
import type { GameStatus } from './status';
import type { Json } from '@/lib/database.types';

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
 * Re-eksportert fra `./greensomeOverridePlan` (#1628), der typen og
 * JSON-leseren nå bor sammen med de rene reglene som bruker dem — denne fila
 * drar med seg `next/cache` + service-role-klienten, og `startScheduledGame`
 * skal ikke arve det for å lese ett JSONB-felt.
 */
export type { TeamStrokesOverride };

/**
 * One greensome match the corrected player takes part in, flattened into the
 * inputs the override rule needs: the game's status/mode/mode_config, which
 * side the player is on, their frozen course handicap *before* and *after* the
 * correction, and their partner's frozen course handicap.
 */
export interface GreensomeOverrideRow {
  gameId: string;
  status: GameStatus;
  /** `games.game_mode` — only `greensome_matchplay` knows the field. */
  gameMode: string;
  /** `games.mode_config`, raw JSON — read defensively. */
  modeConfig: unknown;
  /** `game_players.team_number` (1 or 2); null when the roster has no side. */
  teamNumber: number | null;
  /** The frozen course handicap the stored override was derived from. */
  previousCourseHandicap: number | null;
  /** The recomputed course handicap the correction just produced. */
  newCourseHandicap: number;
  /** The partner's frozen course handicap; null when it can't be resolved. */
  teammateCourseHandicap: number | null;
}

/** A single `mode_config.team_strokes_override` write the recompute wants. */
export interface GreensomeOverrideUpdate {
  gameId: string;
  teamStrokesOverride: TeamStrokesOverride;
}

/**
 * Pure recompute rule for greensome's manual team strokes (#1537). Given the
 * corrected player's greensome matches, decide which stored
 * `mode_config.team_strokes_override` values must follow the new course
 * handicap — and to what.
 *
 * The field is a **manual** override by design (#1441, D10): the organiser may
 * type their own formula (e.g. 40 % of the highest playing handicap), and
 * `computeFoursomesCore` then ignores the course handicaps entirely. But the
 * match generator pre-fills it with `greensomeTeamHandicap(chA, chB)` as a
 * *suggestion*, frozen at generation time. Correct a handicap afterwards and
 * #1176 rewrites `game_players.course_handicap` while that frozen number stays
 * — the match is then scored on the old, wrong handicap (prod: Ryder Cup 2026,
 * Greensome 2 gave strokes on SI 1–8 instead of SI 1–5).
 *
 * The rule keeps both truths: a side is rewritten **only when the stored value
 * is bit-for-bit what the formula gave with the OLD frozen handicaps** — i.e.
 * provably the untouched auto-suggestion. Anything else is the organiser's own
 * number and survives. Applied per side, so the opposing team's value is never
 * touched, and it chains: correct both partners in turn and pass 2 recognises
 * what pass 1 wrote.
 *
 * Same scope as the course-handicap rule: `active` games only (`finished` is
 * history, `scheduled` has no frozen handicaps to compare against), and no
 * formula input missing.
 *
 * Reuses the engine's own `greensomeTeamHandicap` — the formula has one home.
 */
export function planGreensomeOverrideRecompute(
  rows: GreensomeOverrideRow[],
): GreensomeOverrideUpdate[] {
  const updates: GreensomeOverrideUpdate[] = [];
  for (const row of rows) {
    if (row.status !== 'active') continue;
    if (row.gameMode !== 'greensome_matchplay') continue;
    if (row.teamNumber !== 1 && row.teamNumber !== 2) continue;

    const stored = readStoredTeamStrokesOverride(row.modeConfig);
    if (!stored) continue;

    const previous = row.previousCourseHandicap;
    const teammate = row.teammateCourseHandicap;
    if (previous === null || teammate === null) continue;
    if (!Number.isFinite(previous) || !Number.isFinite(teammate)) continue;
    if (!Number.isFinite(row.newCourseHandicap)) continue;

    const side = row.teamNumber === 1 ? 'team1' : 'team2';
    // Not the untouched auto-suggestion → the organiser typed it. Leave it.
    //
    // Load-bearing assumption (#1628, documented not fixed): the two sides of
    // this comparison come from different pipelines. The STORED value was
    // computed by cup generation from *raw* course handicaps (no allowance
    // applied), while `previous`/`teammate` are the *frozen*
    // `game_players.course_handicap` — i.e. after `applyAllowance`. They can
    // only ever be equal when `games.hcp_allowance_pct` is 100, which every
    // cup greensome has: `cupMatchAllowance` puts the greensome allowance in
    // `mode_config.allowance_pct` and pins the games-row column at 100
    // (lib/cup/cupMatchAllowance.ts).
    //
    // No existing row can break the assumption today: cup generation is the
    // only writer of `team_strokes_override` (standalone greensome never
    // emits the field, see `gamePayload.ts`). #634 — a manual team-strokes
    // field outside the cup flow, or a cup greensome on an allowance ≠ 100 —
    // is the trigger to revisit. When it lands, this check must compare like
    // for like (apply the allowance to the formula inputs, or store the basis
    // alongside the value the way `team_strokes_override_auto` now does for
    // scheduled matches).
    if (stored[side] !== greensomeTeamHandicap(previous, teammate)) continue;

    const next = greensomeTeamHandicap(row.newCourseHandicap, teammate);
    if (next === stored[side]) continue;

    updates.push({
      gameId: row.gameId,
      teamStrokesOverride: { ...stored, [side]: next },
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
 * Also follows the correction into greensome's frozen team-strokes suggestion
 * (#1537) — see `planGreensomeOverrideRecompute`.
 *
 * Best-effort: never throws. Returns the number of rows actually rewritten so the
 * caller can log, but a failed lookup or write must never block onboarding.
 */
export async function recomputeCourseHandicapForUser(
  userId: string,
  newHcpIndex: number,
): Promise<{ updated: number; overridesUpdated: number }> {
  const admin = getAdminClient();

  const { data: memberships, error: membershipError } = await admin
    .from('game_players')
    .select('game_id, tee_gender, course_handicap, team_number')
    .eq('user_id', userId)
    .returns<
      {
        game_id: string;
        tee_gender: TeeGender;
        course_handicap: number | null;
        team_number: number | null;
      }[]
    >();
  if (membershipError) {
    console.error('[recomputeCourseHandicap] membership lookup failed', membershipError);
    return { updated: 0, overridesUpdated: 0 };
  }
  if (!memberships || memberships.length === 0) {
    return { updated: 0, overridesUpdated: 0 };
  }

  const gameIds = [...new Set(memberships.map((m) => m.game_id))];
  const { data: games, error: gamesError } = await admin
    .from('games')
    .select(
      'id, status, hcp_allowance_pct, game_mode, mode_config, tee_boxes(slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors)',
    )
    .in('id', gameIds)
    .returns<
      {
        id: string;
        status: GameStatus;
        hcp_allowance_pct: number;
        game_mode: string;
        mode_config: unknown;
        tee_boxes: TeeBoxRatings | null;
      }[]
    >();
  // Best-effort by design (#1445): recompute kalles som etterarbeid når et
  // handicap endres. Feiler oppslaget, står de frosne verdiene igjen slik de
  // var (samme tilstand som før kallet), og neste endring prøver på nytt.
  // Å kaste ville veltet den brukerhandlingen som utløste recomputen.
  if (gamesError || !games) {
    console.error('[recomputeCourseHandicap] games lookup failed', gamesError);
    return { updated: 0, overridesUpdated: 0 };
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
  /** Games whose new course handicap is actually persisted (#1537 input). */
  const writtenCourseHandicaps = new Map<string, number>();
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
    if (affected?.length) {
      writtenCourseHandicaps.set(update.gameId, update.courseHandicap);
      // Roster og banehandicap leses via den cachede `getGameWithPlayers`
      // (tag `game-${id}`) — uten dette viser spillsidene den gamle verdien
      // til revalidate-vinduet løper ut (#1629).
      revalidateTag(`game-${update.gameId}`, 'max');
    }
  }

  let overridesUpdated = 0;
  try {
    overridesUpdated = await recomputeGreensomeOverrides(
      admin,
      userId,
      memberships,
      gameById,
      writtenCourseHandicaps,
    );
  } catch (err) {
    // Best-effort, same contract as the rest: a greensome hiccup must never
    // block a handicap correction that already landed.
    console.error('[recomputeCourseHandicap] greensome override recompute failed', err);
  }

  return { updated, overridesUpdated };
}

/**
 * Follows a landed course-handicap correction into greensome's frozen team-
 * strokes suggestion (#1537). Only games whose course handicap was *actually*
 * rewritten are considered — a 0-row write means the new value never landed,
 * so deriving an override from it would invent a number.
 *
 * The partner's handicap is read as it stands right now, which is what makes
 * sequential corrections of both partners chain correctly.
 *
 * Returns the number of `games.mode_config` rows rewritten.
 */
async function recomputeGreensomeOverrides(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  memberships: { game_id: string; course_handicap: number | null; team_number: number | null }[],
  gameById: Map<
    string,
    { id: string; status: GameStatus; game_mode: string; mode_config: unknown }
  >,
  writtenCourseHandicaps: Map<string, number>,
): Promise<number> {
  const candidates = memberships.filter((m) => {
    if (!writtenCourseHandicaps.has(m.game_id)) return false;
    const game = gameById.get(m.game_id);
    if (!game || game.game_mode !== 'greensome_matchplay') return false;
    return readStoredTeamStrokesOverride(game.mode_config) !== null;
  });
  if (candidates.length === 0) return 0;

  const candidateIds = [...new Set(candidates.map((c) => c.game_id))];
  const { data: partners, error: partnerError } = await admin
    .from('game_players')
    .select('game_id, team_number, course_handicap, withdrawn_at')
    .in('game_id', candidateIds)
    .neq('user_id', userId)
    .returns<
      {
        game_id: string;
        team_number: number | null;
        course_handicap: number | null;
        withdrawn_at: string | null;
      }[]
    >();
  if (partnerError) {
    console.error('[recomputeCourseHandicap] partner lookup failed', partnerError);
    return 0;
  }

  const rows: GreensomeOverrideRow[] = candidates.map((m) => {
    const game = gameById.get(m.game_id)!;
    // Exactly one active partner on the same side, or we have no formula input
    // we can trust (a withdrawal + replacement can leave two rows on a side).
    const sameSide = (partners ?? []).filter(
      (p) =>
        p.game_id === m.game_id &&
        p.team_number === m.team_number &&
        p.withdrawn_at === null,
    );
    return {
      gameId: m.game_id,
      status: game.status,
      gameMode: game.game_mode,
      modeConfig: game.mode_config,
      teamNumber: m.team_number,
      previousCourseHandicap: m.course_handicap,
      newCourseHandicap: writtenCourseHandicaps.get(m.game_id)!,
      teammateCourseHandicap:
        sameSide.length === 1 ? sameSide[0].course_handicap : null,
    };
  });

  let written = 0;
  for (const update of planGreensomeOverrideRecompute(rows)) {
    const stored = gameById.get(update.gameId)?.mode_config;
    // Merge, aldri erstatt: kind/team_size/allowance_pct må overleve.
    const base =
      stored && typeof stored === 'object' ? (stored as Record<string, Json>) : {};
    const nextConfig: Json = {
      ...base,
      team_strokes_override: update.teamStrokesOverride,
    };
    const { data: affected, error: writeError } = await admin
      .from('games')
      .update({ mode_config: nextConfig })
      .eq('id', update.gameId)
      .select('id');
    if (writeError) {
      console.error('[recomputeCourseHandicap] mode_config update failed', writeError);
      continue;
    }
    if (!affected?.length) continue;
    written += affected.length;
    // Hull-siden og kamp-tavla leser mode_config via `game-${id}`-cachen.
    revalidateTag(`game-${update.gameId}`, 'max');
  }
  return written;
}
