import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { registrationPlayerCap } from '@/lib/wizard/fitsPlayerCount';
import { registrationSeatTeamSize } from './teamFormatLimits';
import { countSidePlayers, isMatchplayMode, isMatchplaySideFull } from './matchplaySides';
import type { GameSeats } from './terminliste';
import type { GameMode } from '@/lib/scoring/modes/types';

export type { GameSeats } from './terminliste';

export type SeatGame = {
  id: string;
  game_mode: GameMode;
  mode_config: { team_size?: number } | null;
};

/**
 * Seats on the games a discovery list shows (#2258), for the terminliste's
 * capacity line and «Fullt».
 *
 * The numbers are the signup's own. The cap and the seat team size come from
 * `registrationPlayerCap` and `registrationSeatTeamSize`, the functions
 * `registerForOpenGame` passes to the seat claim, and the seats held come from
 * `registration_seats_held` — the SQL function the claim itself counts with.
 * Matchplay has no cap; a side is full by `isMatchplaySideFull`, the rule
 * behind the signup's `side_full`.
 *
 * One RPC for every capped game and one roster read for every matchplay game.
 * A game without a cap that is not matchplay gets no entry. Admin client
 * (service role): the function is service-role only, and visitors cannot read
 * other games' rosters. Only counts leave this helper. Best-effort: an error
 * is logged and the affected games get no entry, so the row renders without a
 * capacity line rather than failing the page.
 */
export async function getRegistrationSeats(
  games: readonly SeatGame[],
): Promise<Map<string, GameSeats>> {
  const seats = new Map<string, GameSeats>();

  const unique = [...new Map(games.map((g) => [g.id, g])).values()];
  const capped: { id: string; cap: number; seatTeamSize: number }[] = [];
  const matchplay: { id: string; teamSize: number }[] = [];
  for (const g of unique) {
    const teamSize = g.mode_config?.team_size;
    if (isMatchplayMode(g.game_mode)) {
      // Same default as registerForOpenGame's side count.
      matchplay.push({ id: g.id, teamSize: teamSize ?? 1 });
      continue;
    }
    const cap = registrationPlayerCap(g.game_mode, g.mode_config);
    if (cap !== null) {
      capped.push({
        id: g.id,
        cap,
        seatTeamSize: registrationSeatTeamSize(g.game_mode, teamSize),
      });
    }
  }
  if (capped.length === 0 && matchplay.length === 0) return seats;

  const admin = getAdminClient();
  const [heldRes, rosterRes] = await Promise.all([
    capped.length > 0
      ? admin.rpc('registration_seats_held', {
          p_game_ids: capped.map((g) => g.id),
          p_seat_team_sizes: capped.map((g) => g.seatTeamSize),
        })
      : null,
    matchplay.length > 0
      ? admin
          .from('game_players')
          .select('game_id, team_number, withdrawn_at')
          .in(
            'game_id',
            matchplay.map((g) => g.id),
          )
          .is('withdrawn_at', null)
      : null,
  ]);

  if (heldRes?.error) {
    console.error('[getRegistrationSeats] registration_seats_held failed', heldRes.error);
  } else if (heldRes) {
    const held = new Map((heldRes.data ?? []).map((r) => [r.game_id, r.seats]));
    for (const g of capped) {
      seats.set(g.id, { kind: 'capped', cap: g.cap, held: held.get(g.id) ?? 0 });
    }
  }

  if (rosterRes?.error) {
    console.error('[getRegistrationSeats] matchplay roster failed', rosterRes.error);
  } else if (rosterRes) {
    const rows = rosterRes.data ?? [];
    for (const g of matchplay) {
      const { side1, side2 } = countSidePlayers(rows.filter((r) => r.game_id === g.id));
      seats.set(g.id, {
        kind: 'matchplay',
        full: isMatchplaySideFull(side1, g.teamSize) && isMatchplaySideFull(side2, g.teamSize),
      });
    }
  }

  return seats;
}
