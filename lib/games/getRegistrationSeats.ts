import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { effectiveRegistrationCap } from '@/lib/wizard/fitsPlayerCount';
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

type OrganizerSettings = {
  id: string;
  registration_cap: number | null;
  waitlist_enabled: boolean;
  registration_mode: 'invite_only' | 'manual_approval' | 'open';
};

/**
 * Seats on the games a discovery list shows (#2258), for the terminliste's
 * capacity line and «Fullt», and the signup page's «X av Y plasser» (#2837).
 *
 * The numbers are the signup's own. The cap is `effectiveRegistrationCap` —
 * the format's cap or the organiser's, whichever is lower (#2482) — and the
 * seat team size comes from `registrationSeatTeamSize`, the values
 * `registerForOpenGame` passes to the seat claim. The seats held come from
 * `registration_seats_held`, the SQL function the claim itself counts with,
 * and the waiting list from `registration_waitlist`, the queue the promotion
 * reads (0239). Matchplay has no cap; a side is full by `isMatchplaySideFull`,
 * the rule behind the signup's `side_full`.
 *
 * The organiser's cap and list switch are read here, from the games rows, so
 * no list has to remember to select them. Then one RPC for every capped game,
 * one for the waiting lists and one roster read for every matchplay game. A
 * game without a cap that is not matchplay gets no entry. Admin client
 * (service role): the functions are service-role only, and visitors cannot
 * read other games' rosters. Only counts leave this helper. Best-effort: an
 * error is logged and the affected games get no entry (or no waiting-list
 * count), so the row renders without a capacity line rather than failing the
 * page.
 */
export async function getRegistrationSeats(
  games: readonly SeatGame[],
): Promise<Map<string, GameSeats>> {
  const seats = new Map<string, GameSeats>();

  const unique = [...new Map(games.map((g) => [g.id, g])).values()];
  const other = unique.filter((g) => !isMatchplayMode(g.game_mode));
  const matchplay = unique
    .filter((g) => isMatchplayMode(g.game_mode))
    // Same default as registerForOpenGame's side count.
    .map((g) => ({ id: g.id, teamSize: g.mode_config?.team_size ?? 1 }));
  if (other.length === 0 && matchplay.length === 0) return seats;

  const admin = getAdminClient();
  const [settingsRes, rosterRes] = await Promise.all([
    other.length > 0
      ? admin
          .from('games')
          .select('id, registration_cap, waitlist_enabled, registration_mode')
          .in(
            'id',
            other.map((g) => g.id),
          )
          .returns<OrganizerSettings[]>()
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

  const capped: { id: string; cap: number; seatTeamSize: number; waitlist: boolean }[] = [];
  if (settingsRes?.error) {
    console.error('[getRegistrationSeats] organiser settings failed', settingsRes.error);
  } else if (settingsRes) {
    const settings = new Map((settingsRes.data ?? []).map((r) => [r.id, r]));
    for (const g of other) {
      const s = settings.get(g.id);
      const cap = effectiveRegistrationCap(g.game_mode, g.mode_config, s?.registration_cap);
      if (cap === null) continue;
      capped.push({
        id: g.id,
        cap,
        seatTeamSize: registrationSeatTeamSize(g.game_mode, g.mode_config?.team_size),
        waitlist: s?.waitlist_enabled === true && s.registration_mode === 'open',
      });
    }
  }

  const withList = capped.filter((g) => g.waitlist).map((g) => g.id);
  const [heldRes, waitlistRes] = await Promise.all([
    capped.length > 0
      ? admin.rpc('registration_seats_held', {
          p_game_ids: capped.map((g) => g.id),
          p_seat_team_sizes: capped.map((g) => g.seatTeamSize),
        })
      : null,
    withList.length > 0 ? admin.rpc('registration_waitlist', { p_game_ids: withList }) : null,
  ]);

  // A failed waiting-list read drops only the count: the seats still show.
  const waiting = new Map<string, number>();
  if (waitlistRes?.error) {
    console.error('[getRegistrationSeats] registration_waitlist failed', waitlistRes.error);
  } else {
    for (const row of waitlistRes?.data ?? []) {
      waiting.set(row.game_id, (waiting.get(row.game_id) ?? 0) + 1);
    }
  }

  if (heldRes?.error) {
    console.error('[getRegistrationSeats] registration_seats_held failed', heldRes.error);
  } else if (heldRes) {
    const held = new Map((heldRes.data ?? []).map((r) => [r.game_id, r.seats]));
    for (const g of capped) {
      seats.set(g.id, {
        kind: 'capped',
        cap: g.cap,
        held: held.get(g.id) ?? 0,
        ...(g.waitlist && !waitlistRes?.error ? { waitlist: waiting.get(g.id) ?? 0 } : {}),
      });
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
