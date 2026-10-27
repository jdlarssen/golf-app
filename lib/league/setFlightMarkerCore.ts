import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notifications/notify';
import {
  submitScorecardCore,
  type SubmitScorecardResult,
} from '@/lib/games/submitScorecardCore';
import { loadFlightDeliveryCards } from '@/lib/games/loadFlightDelivery';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';
import { readSimulatorLeagueFlight, type LeagueFlight } from './leagueFlight';
import { markerCandidates, markerRefusal, type MarkerRefusal } from './leagueMarker';

// Delivering a card in a simulator league (#2661). The player names a marker
// from the league, and the marker approves the card before the round counts.
// Both the web's submit action and the app's `submit-team` route call
// `submitScorecardWithMarker`, so the rule has one home (AGENTS.md trap 4).
//
// Outside a simulator league it is `submitScorecardCore` unchanged: a marker
// in the request is ignored.
//
// ORDER, on purpose: the marker is written before the delivery. When the
// delivery fails after that, the marker stands on a card that is not
// delivered. That does no harm: nothing reads `marker_user_id` before
// `submitted_at` is set, and the next delivery writes it again. An undo, on
// the other hand, could race the player's second tap. Same reasoning as
// `freezeRoundSettings` in the start core.

const LOG_PREFIX = 'submitScorecardWithMarker';

export type SubmitWithMarkerResult =
  | SubmitScorecardResult
  | { ok: false; reason: MarkerRefusal };

type MarkerWrite =
  | { ok: true; markedIds: string[] }
  | { ok: false; reason: MarkerRefusal | 'db' };

/**
 * Checks the named marker against the league and writes it on the cards this
 * delivery covers: the deliverer's own card and the flightmates' in `alsoFor`
 * that the deliverer may deliver, narrowed with the core's own rule
 * (`loadFlightDeliveryCards`). A caller who is not an active player in the
 * game marks nothing; the core then refuses the delivery itself. The check is
 * `markerRefusal`, against the league's members read here, so a hand-made
 * request gets the same answer as the form.
 *
 * Only cards that are not delivered yet are marked (`submitted_at is null`),
 * so the marker on a delivered card never moves under its marker's feet. The
 * write goes through the admin client: the column is server-owned (0220).
 * Zero rows is not an error here: every card in the delivery is already in
 * (a second tap), and the delivery after it answers `alreadySubmitted`.
 * `markedIds` are the cards the marker was written on.
 */
export async function setFlightMarkerCore(opts: {
  flight: LeagueFlight;
  delivererId: string;
  alsoFor: readonly string[];
  markerUserId: string | null;
}): Promise<MarkerWrite> {
  const { flight, delivererId, markerUserId } = opts;
  const admin = getAdminClient();

  const { data: me, error: meError } = await admin
    .from('game_players')
    .select('user_id')
    .eq('game_id', flight.gameId)
    .eq('user_id', delivererId)
    .is('withdrawn_at', null)
    .maybeSingle();
  if (meError) {
    console.error(`[${LOG_PREFIX}] player read failed`, { gameId: flight.gameId, meError });
    return { ok: false, reason: 'db' };
  }
  if (!me) return { ok: true, markedIds: [] };

  const mates = await deliverableMates(flight.gameId, delivererId, opts.alsoFor);
  if (mates === null) return { ok: false, reason: 'db' };
  const cardOwnerIds = [delivererId, ...mates];

  const { data: members, error: membersError } = await admin
    .from('league_players')
    .select('user_id')
    .eq('league_id', flight.leagueId);
  if (membersError) {
    console.error(`[${LOG_PREFIX}] members read failed`, { gameId: flight.gameId, membersError });
    return { ok: false, reason: 'db' };
  }
  const refusal = markerRefusal({
    markerUserId,
    memberIds: (members ?? []).map((m) => m.user_id),
    cardOwnerIds,
    delivererId,
  });
  if (refusal) return { ok: false, reason: refusal };

  const { data: marked, error } = await admin
    .from('game_players')
    .update({ marker_user_id: markerUserId })
    .eq('game_id', flight.gameId)
    .in('user_id', cardOwnerIds)
    .is('submitted_at', null)
    .is('withdrawn_at', null)
    .select('user_id');
  if (error) {
    console.error(`[${LOG_PREFIX}] marker write failed`, { gameId: flight.gameId, error });
    return { ok: false, reason: 'db' };
  }
  return { ok: true, markedIds: (marked ?? []).map((r) => r.user_id) };
}

/**
 * The flightmates in `alsoFor` the deliverer may deliver, the same narrowing
 * as the core (`loadFlightDeliveryCards`). `null` on a failed read.
 */
async function deliverableMates(
  gameId: string,
  delivererId: string,
  alsoFor: readonly string[],
): Promise<string[] | null> {
  const asked = new Set(alsoFor);
  asked.delete(delivererId);
  if (asked.size === 0) return [];
  try {
    const { data: game, error } = await getAdminClient()
      .from('games')
      .select('game_mode, hole_segment, source_game_id')
      .eq('id', gameId)
      .maybeSingle<{ game_mode: GameMode; hole_segment: HoleSegment; source_game_id: string | null }>();
    if (error || !game) throw error ?? new Error('game not found');
    const cards = await loadFlightDeliveryCards(gameId, delivererId, game);
    return cards.map((c) => c.userId).filter((id) => asked.has(id));
  } catch (err) {
    console.error(`[${LOG_PREFIX}] flight candidates read failed`, { gameId, err });
    return null;
  }
}

/**
 * Deliver the caller's card, the way `submitScorecardCore` does, and in a
 * simulator league name the marker first (`setFlightMarkerCore`) and tell the
 * marker afterwards (`league_marker_request`, one per delivered card).
 *
 * In a simulator flight the flightmates are not asked to approve
 * (`peerNotices: false`): the marker approves, and nobody in the flight can
 * (`canApproveScorecardFor`, 0220).
 */
export async function submitScorecardWithMarker(
  supabase: SupabaseClient<Database>,
  gameId: string,
  userId: string,
  opts: { alsoFor?: readonly string[]; markerUserId?: string | null } = {},
): Promise<SubmitWithMarkerResult> {
  const alsoFor = opts.alsoFor ?? [];
  let flight: LeagueFlight | null;
  try {
    flight = await readSimulatorLeagueFlight(gameId);
  } catch (err) {
    console.error(`[${LOG_PREFIX}] league read failed`, { gameId, err });
    return { ok: false, reason: 'db' };
  }
  if (!flight) return submitScorecardCore(supabase, gameId, userId, { alsoFor });

  const marker = await setFlightMarkerCore({
    flight,
    delivererId: userId,
    alsoFor,
    markerUserId: opts.markerUserId ?? null,
  });
  if (!marker.ok) return { ok: false, reason: marker.reason };

  const result = await submitScorecardCore(supabase, gameId, userId, {
    alsoFor,
    peerNotices: false,
  });
  if (result.ok && !result.alreadySubmitted && marker.markedIds.length > 0) {
    await notifyMarker(flight, opts.markerUserId!, marker.markedIds);
  }
  return result;
}

/**
 * `league_marker_request` to the marker for each card this call delivered:
 * the marked cards that are delivered now. Best-effort like every notice: a
 * failure is logged and never undoes the delivery.
 */
async function notifyMarker(
  flight: LeagueFlight,
  markerUserId: string,
  markedIds: readonly string[],
): Promise<void> {
  try {
    const { data: delivered, error } = await getAdminClient()
      .from('game_players')
      .select('user_id, users!game_players_user_id_fkey(name, nickname)')
      .eq('game_id', flight.gameId)
      .eq('marker_user_id', markerUserId)
      .in('user_id', [...markedIds])
      .not('submitted_at', 'is', null)
      .returns<{ user_id: string; users: { name: string | null; nickname: string | null } | null }[]>();
    if (error) throw error;
    const results = await Promise.allSettled(
      (delivered ?? []).map((row) =>
        notify({
          userId: markerUserId,
          kind: 'league_marker_request',
          payload: {
            league_id: flight.leagueId,
            league_name: flight.leagueName,
            game_id: flight.gameId,
            player_id: row.user_id,
            player_name: row.users?.name?.trim() || row.users?.nickname?.trim() || null,
          },
        }),
      ),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error(`[${LOG_PREFIX}] league_marker_request notify failed`, r.reason);
      }
    }
  } catch (err) {
    console.error(`[${LOG_PREFIX}] league_marker_request failed`, { gameId: flight.gameId, err });
  }
}

/** One name in the marker picker. */
export type MarkerOption = { userId: string; name: string | null };

/**
 * The marker picker for a delivery, or null when the game is not a
 * simulator-league flight (no picker). The candidates are `markerCandidates`
 * over the league's members, by name. Read with the admin client: the members
 * outside the flight are invisible to the player's RLS client. A failed read
 * throws (the page's error boundary), never «no picker».
 */
export async function loadMarkerChoice(
  gameId: string,
  delivererId: string,
  cardOwnerIds: readonly string[],
): Promise<{ flight: LeagueFlight; options: MarkerOption[] } | null> {
  const flight = await readSimulatorLeagueFlight(gameId);
  if (!flight) return null;
  const { data, error } = await getAdminClient()
    .from('league_players')
    .select('user_id, users!league_players_user_id_fkey(name, nickname)')
    .eq('league_id', flight.leagueId)
    .returns<{ user_id: string; users: { name: string | null; nickname: string | null } | null }[]>();
  if (error) throw new Error(`loadMarkerChoice: ${error.message}`);
  const nameOf = new Map(
    (data ?? []).map((m) => [m.user_id, m.users?.name?.trim() || m.users?.nickname?.trim() || null]),
  );
  const options = markerCandidates([...nameOf.keys()], cardOwnerIds, delivererId)
    .map((userId) => ({ userId, name: nameOf.get(userId) ?? null }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'nb'));
  return { flight, options };
}
