/**
 * What the flight has reported on a hole, as the web reads and writes it
 * (#2283, part D2). The app has its own copy in `native/app/src/data/sideClaims.ts`;
 * the shared rules (who may report, which holes) live in `sideContest.ts`.
 *
 * Three facts carry the file, the same three as in the app:
 *
 *  1. **Reads go through RLS.** `game_side_claims` and `game_gir_claims` have one
 *     SELECT policy each: the row sits in the caller's own flight
 *     (`side_claim_flight_key`, 0237). No read here sends a flight key, so no
 *     read can see another flight's reports.
 *  2. **Writes go only through the two rpcs** (`record_side_claim`,
 *     `record_gir_claims`). They answer `'ok'` only when they wrote the rows
 *     they were asked to, else a code. Anything but the exact answer `'ok'` is a
 *     failure (AGENTS.md trap 2).
 *  3. **A failed read is not an empty read.** `readHoleClaims` says `ok: false`,
 *     so «Fikk ikke hentet» never shows up as «ingen har meldt inn».
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { HoleContest, SideContestCategory } from './sideContest';

const SIDE_CLAIM_SELECT = 'category, hole_number, winner_user_id, distance_m, entered_by, updated_at';
const GIR_CLAIM_SELECT = 'hole_number, user_id, hit, entered_by, updated_at';

/** The flight's answer for one category on a hole. `winnerUserId: null` = «Ingen på …». */
export interface SideClaim {
  category: SideContestCategory;
  holeNumber: number;
  winnerUserId: string | null;
  distanceM: number | null;
  enteredBy: string;
  updatedAt: string;
}

/** One player's GIR on a hole. No row = not reported; `hit: false` = missed. */
export interface GirClaim {
  holeNumber: number;
  userId: string;
  hit: boolean;
  enteredBy: string;
  updatedAt: string;
}

/** Which tables a hole needs. Both `false` = no read. */
export type HoleClaimsNeed = { side: boolean; gir: boolean };

/** The tables the contests on a hole report into: CTP and LD in one, GIR in the other. */
export function claimsNeeded(contests: readonly HoleContest[]): HoleClaimsNeed {
  return {
    side: contests.some((c) => c.category !== 'gir'),
    gir: contests.some((c) => c.category === 'gir'),
  };
}

function isSideCategory(category: string): category is SideContestCategory {
  return category === 'closest_to_pin' || category === 'longest_drive';
}

type SideClaimRow = Pick<
  Database['public']['Tables']['game_side_claims']['Row'],
  'category' | 'hole_number' | 'winner_user_id' | 'distance_m' | 'entered_by' | 'updated_at'
>;
type GirClaimRow = Pick<
  Database['public']['Tables']['game_gir_claims']['Row'],
  'hole_number' | 'user_id' | 'hit' | 'entered_by' | 'updated_at'
>;

/** `distance_m` is `numeric(3,1)`: PostgREST sends a number, but a string would not surprise anyone. */
export function toSideClaims(rows: readonly SideClaimRow[]): SideClaim[] {
  return rows.flatMap((row) => {
    // The CHECK holds the category to the two; an unknown one is left out, not guessed at.
    if (!isSideCategory(row.category)) return [];
    const distance = row.distance_m == null ? null : Number(row.distance_m);
    return [
      {
        category: row.category,
        holeNumber: row.hole_number,
        winnerUserId: row.winner_user_id,
        distanceM: distance != null && Number.isFinite(distance) ? distance : null,
        enteredBy: row.entered_by,
        updatedAt: row.updated_at,
      },
    ];
  });
}

export function toGirClaims(rows: readonly GirClaimRow[]): GirClaim[] {
  return rows.map((row) => ({
    holeNumber: row.hole_number,
    userId: row.user_id,
    hit: row.hit,
    enteredBy: row.entered_by,
    updatedAt: row.updated_at,
  }));
}

/**
 * A read of the hole's claims. A table that was not asked for comes back
 * `undefined`; an empty list is a valid answer.
 */
export type HoleClaimsRead =
  | { ok: true; side: SideClaim[] | undefined; gir: GirClaim[] | undefined }
  | { ok: false; error: unknown };

/**
 * The flight's reports on one hole, under the caller's own session (RLS = own
 * flight). Never throws: the server page and the browser hook both need
 * «failed» as a value, and a thrown error in the render wave would fell the
 * whole hole page.
 */
export async function readHoleClaims(
  client: Pick<SupabaseClient<Database>, 'from'>,
  args: { gameId: string; holeNumber: number; need: HoleClaimsNeed },
): Promise<HoleClaimsRead> {
  const { gameId, holeNumber, need } = args;
  try {
    const [sideRes, girRes] = await Promise.all([
      need.side
        ? client
            .from('game_side_claims')
            .select(SIDE_CLAIM_SELECT)
            .eq('game_id', gameId)
            .eq('hole_number', holeNumber)
        : null,
      need.gir
        ? client
            .from('game_gir_claims')
            .select(GIR_CLAIM_SELECT)
            .eq('game_id', gameId)
            .eq('hole_number', holeNumber)
        : null,
    ]);
    if (sideRes?.error) return { ok: false, error: sideRes.error };
    if (girRes?.error) return { ok: false, error: girRes.error };
    return {
      ok: true,
      side: sideRes ? toSideClaims(sideRes.data ?? []) : undefined,
      gir: girRes ? toGirClaims(girRes.data ?? []) : undefined,
    };
  } catch (error) {
    return { ok: false, error };
  }
}

// -----------------------------------------------------------------------------
// Writing
// -----------------------------------------------------------------------------

/**
 * The codes the rpcs answer with when they wrote nothing (0237):
 *
 *  - `not_player`   — withdrawn, not in the game, or no flight in a bigger game.
 *  - `not_active`   — the round is not running (finished while you stood on the hole).
 *  - `no_slot`      — the hole is not a contest hole for the category.
 *  - `wrong_flight` — a named player is not in your flight (an empty list too).
 *  - `bad_distance` — outside 0,1–99,9 m, or not allowed for the category.
 */
export type SideClaimCode = 'not_player' | 'not_active' | 'no_slot' | 'wrong_flight' | 'bad_distance';

const CODES: readonly SideClaimCode[] = ['not_player', 'not_active', 'no_slot', 'wrong_flight', 'bad_distance'];

/**
 * Why a report was not saved. `db_error` is everything the rpc did not answer
 * with a code: a network failure, a server error, an answer we do not know.
 * The player's remedy is «prøv igjen».
 */
export type SideClaimFailure = SideClaimCode | 'not_authenticated' | 'db_error';

export type SideClaimWriteResult = { ok: true } | { ok: false; error: SideClaimFailure };

/** Only the exact answer `'ok'` is a success. Null, `[]`, an unknown string and an error are not. */
export function readRpcAnswer(result: { data: unknown; error: unknown }): SideClaimWriteResult {
  if (result.error) return { ok: false, error: 'db_error' };
  if (result.data === 'ok') return { ok: true };
  const code = CODES.find((c) => c === result.data);
  return { ok: false, error: code ?? 'db_error' };
}
