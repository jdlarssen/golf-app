'use server';

import {
  parseClaimDistance,
  SIDE_CONTEST_HOLE_MAX,
  SIDE_CONTEST_HOLE_MIN,
} from '@/lib/games/sideContest';
import { readRpcAnswer, type SideClaimWriteResult } from '@/lib/games/sideClaims';
import { getServerClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/url/isUuid';

// #2283 (part D2): the write paths for what the flight reports on a contest
// hole. The two rpcs (0237) are the only way in: the tables have no write
// policy and no write grant, and the rpc takes the flight from the caller's
// session (`side_claim_flight_key`), never from the payload.
//
// The result type is `SideClaimWriteResult` in `lib/games/sideClaims.ts`; a
// 'use server' file may not re-export types, and the hole page imports it from
// there.
//
// Both actions answer ok only on the rpc's exact answer `'ok'`: a null, an
// error, a code and an answer we do not know are all failures (AGENTS.md trap
// 2: PostgREST hands back `error == null` for work that never happened).
//
// No `updateTag`: the claims are not in the `game-${id}` cache. The hole page
// reads them per request and the browser re-reads them after a save
// (`useSideClaims`), so there is nothing cached to expire.
//
// A bad payload is refused before the rpc with the code the rpc itself would
// have answered, so the vocabulary stays the one the app uses:
//   a game that is no uuid  -> not_player   (the rpc finds no player)
//   a category or hole off  -> no_slot
//   a player that is no uuid, or an empty list -> wrong_flight
//   a distance off the 0,1–99,9 grid           -> bad_distance
//   a `hit` that is no boolean                 -> db_error (the rpc would raise)

export interface RecordSideClaimInput {
  gameId: string;
  category: 'closest_to_pin' | 'longest_drive';
  holeNumber: number;
  /** `null` = «Ingen på green/fairway». */
  winnerUserId: string | null;
  /** Only for closest to pin with a winner. Rounded to one decimal in the rpc. */
  distanceM: number | null;
}

export interface RecordGirClaimsInput {
  gameId: string;
  holeNumber: number;
  /** The players on the ball (one, or both on a foursomes side), or the whole match. */
  userIds: string[];
  hit: boolean;
}

function isHole(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SIDE_CONTEST_HOLE_MIN &&
    value <= SIDE_CONTEST_HOLE_MAX
  );
}

/** The server client when the cookie session names a user, else null. The rpc reads the caller from the same session. */
async function signedInClient() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

/** Save the flight's answer for one category on the hole. The last tap wins. */
export async function recordSideClaim(input: RecordSideClaimInput): Promise<SideClaimWriteResult> {
  // A server action takes any payload, so every field is checked as `unknown`.
  const { gameId, category, holeNumber, winnerUserId, distanceM } = (input ?? {}) as Partial<
    Record<keyof RecordSideClaimInput, unknown>
  >;

  if (typeof gameId !== 'string' || !isUuid(gameId)) return { ok: false, error: 'not_player' };
  if (category !== 'closest_to_pin' && category !== 'longest_drive') return { ok: false, error: 'no_slot' };
  if (!isHole(holeNumber)) return { ok: false, error: 'no_slot' };
  if (winnerUserId !== null && (typeof winnerUserId !== 'string' || !isUuid(winnerUserId))) {
    return { ok: false, error: 'wrong_flight' };
  }
  // The same grid the field is parsed on (`parseClaimDistance`): 0,1–99,9 m
  // after rounding to one decimal. The rpc rounds again and checks again; that
  // one is the authority, this one only keeps a nonsense number from reaching it.
  let distance: number | null = null;
  if (distanceM !== null) {
    if (typeof distanceM !== 'number') return { ok: false, error: 'bad_distance' };
    const parsed = parseClaimDistance(String(distanceM));
    if (!parsed.ok) return { ok: false, error: 'bad_distance' };
    distance = parsed.distanceM;
  }

  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: 'not_authenticated' };

  try {
    const result = await supabase.rpc('record_side_claim', {
      p_game_id: gameId,
      p_category: category,
      p_hole_number: holeNumber,
      // Both are nullable in the rpc; the generated argument type is not, hence the casts.
      p_winner_user_id: winnerUserId as string,
      p_distance_m: distance as number,
    });
    const answer = readRpcAnswer(result);
    if (!answer.ok && answer.error === 'db_error') {
      console.error('[recordSideClaim] rpc did not answer ok', { gameId, category, holeNumber, result });
    }
    return answer;
  } catch (error) {
    console.error('[recordSideClaim] rpc threw', { gameId, category, holeNumber, error });
    return { ok: false, error: 'db_error' };
  }
}

/**
 * Save GIR for one ball, or «Ingen traff greenen» for the whole match. The rpc
 * writes every row or none.
 */
export async function recordGirClaims(input: RecordGirClaimsInput): Promise<SideClaimWriteResult> {
  const { gameId, holeNumber, userIds, hit } = (input ?? {}) as Partial<
    Record<keyof RecordGirClaimsInput, unknown>
  >;

  if (typeof gameId !== 'string' || !isUuid(gameId)) return { ok: false, error: 'not_player' };
  if (!isHole(holeNumber)) return { ok: false, error: 'no_slot' };
  if (
    !Array.isArray(userIds) ||
    userIds.length === 0 ||
    userIds.some((id) => typeof id !== 'string' || !isUuid(id))
  ) {
    return { ok: false, error: 'wrong_flight' };
  }
  if (typeof hit !== 'boolean') return { ok: false, error: 'db_error' };

  const supabase = await signedInClient();
  if (!supabase) return { ok: false, error: 'not_authenticated' };

  try {
    const result = await supabase.rpc('record_gir_claims', {
      p_game_id: gameId,
      p_hole_number: holeNumber,
      p_user_ids: userIds,
      p_hit: hit,
    });
    const answer = readRpcAnswer(result);
    if (!answer.ok && answer.error === 'db_error') {
      console.error('[recordGirClaims] rpc did not answer ok', { gameId, holeNumber, result });
    }
    return answer;
  } catch (error) {
    console.error('[recordGirClaims] rpc threw', { gameId, holeNumber, error });
    return { ok: false, error: 'db_error' };
  }
}
