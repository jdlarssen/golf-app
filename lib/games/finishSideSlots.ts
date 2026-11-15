/**
 * What the web's two finish pages show under each side-contest select
 * (#2283, drawing V2): the slot's hole and what the flights reported for it.
 * Both pages call `loadSideSlotViews` after their own gate, so the hole, the
 * flights and the names are worked out in one place. The rule for a slot's
 * lines is `reportsForSlot` (`sideClaimReports.ts`), the one the app's finish
 * screen uses too.
 *
 * The read goes through the admin client because the claim tables' SELECT
 * policy shows a player only their own flight; the organiser sees them all.
 * The page's `requireAdmin` / `requireAdminOrCreator` is the enforcement, as
 * for the roster on the creator page (#2213).
 *
 * A failed read must never stop the organiser from finishing: the slots with a
 * hole come back as `'failed'` and the form shows the app's «Fikk ikke hentet»
 * line, with the selects working as before.
 */
import { getAdminClient } from '@/lib/supabase/admin';
import type { GameMode } from '@/lib/scoring/modes/types';
import { claimFlightKeys, holeForSlot, type SideContestCategory } from './sideContest';
import {
  reportsForSlot,
  toSideClaimReports,
  type SideClaimReport,
  type SlotReports,
} from './sideClaimReports';

/** One slot as the form draws it. `hole: null` = no hole chosen, so no box and the label as before. */
export type SideSlotView = {
  hole: number | null;
  /** `'failed'` = the read did not work; `null` = the slot has no hole. */
  reports: SlotReports | 'failed' | null;
};

export type SideSlotViews = { ld: SideSlotView[]; ctp: SideSlotView[] };

/** The columns of `games` this reads. */
export type FinishSideGame = {
  game_mode: GameMode;
  side_ld_count: number;
  side_ctp_count: number;
  // An array element can be null: that slot has no hole.
  side_ld_holes: (number | null)[] | null;
  side_ctp_holes: (number | null)[] | null;
};

/** A `game_players` row with its user, withdrawn players included. */
export type FinishSidePlayer = {
  user_id: string;
  flight_number: number | null;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null } | null;
};

const CLAIM_COLUMNS = 'category, hole_number, flight_number, winner_user_id, distance_m';

type ClaimRow = {
  category: string;
  hole_number: number;
  flight_number: number;
  winner_user_id: string | null;
  distance_m: number | string | null;
};

function holesFor(
  holes: readonly (number | null)[] | null,
  count: number,
): (number | null)[] {
  return Array.from({ length: count }, (_, i) => holeForSlot(holes, count, i + 1));
}

/** Every flight's reports for the game, or `null` when the read failed (logged, never thrown). */
async function readAllClaims(
  gameId: string,
  players: readonly FinishSidePlayer[],
): Promise<SideClaimReport[] | null> {
  try {
    const { data, error } = await getAdminClient()
      .from('game_side_claims')
      .select(CLAIM_COLUMNS)
      .eq('game_id', gameId)
      .returns<ClaimRow[]>();
    if (error) {
      console.error('[finishSideSlots] could not read the flights\' reports', error);
      return null;
    }
    const byId = new Map(players.map((p) => [p.user_id, p.users]));
    // A winner is always a player of the game (the rpc checks); an unknown id
    // gets an empty name rather than a guess.
    return toSideClaimReports(data ?? [], (winnerUserId) => byId.get(winnerUserId) ?? { name: null, nickname: null });
  } catch (err) {
    console.error('[finishSideSlots] could not read the flights\' reports', err);
    return null;
  }
}

/**
 * The slots' holes and reports for the finish form. Reads the claims only when
 * a slot has a hole; with none, the form is as it was and nothing is read.
 */
export async function loadSideSlotViews(
  gameId: string,
  game: FinishSideGame,
  /** The page's roster read as it came back: a failed read of it is an empty roster here. */
  rosterRows: readonly FinishSidePlayer[] | null,
): Promise<SideSlotViews> {
  const players = rosterRows ?? [];
  const ldHoles = holesFor(game.side_ld_holes, game.side_ld_count);
  const ctpHoles = holesFor(game.side_ctp_holes, game.side_ctp_count);
  const anyHole = [...ldHoles, ...ctpHoles].some((hole) => hole !== null);
  const claims = anyHole ? await readAllClaims(gameId, players) : null;

  const flights = claimFlightKeys(
    game.game_mode,
    players.map((p) => ({ user_id: p.user_id, flight_number: p.flight_number, withdrawn_at: p.withdrawn_at })),
  );
  const roster = players.map((p) => ({ userId: p.user_id, name: p.users?.name ?? null }));

  const view = (category: SideContestCategory, hole: number | null): SideSlotView => {
    if (hole === null) return { hole, reports: null };
    if (claims === null) return { hole, reports: 'failed' };
    return { hole, reports: reportsForSlot({ category, hole }, claims, flights, roster) };
  };

  return {
    ld: ldHoles.map((hole) => view('longest_drive', hole)),
    ctp: ctpHoles.map((hole) => view('closest_to_pin', hole)),
  };
}
