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
import { approveScorecardCore } from '@/lib/games/reviewScorecardCore';
import { sendDeliveryReminder } from '@/lib/notifications/deliveryReminder';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';
import { readSimulatorLeagueFlight, type LeagueFlight } from './leagueFlight';
import {
  activeFlightmates,
  handedOverMarker,
  markerCandidates,
  markerRefusal,
  orderMarkerOptions,
  returnedToMarker,
  unchangedSinceMarker,
  type MarkerRefusal,
} from './leagueMarker';
import { playerName } from '@/lib/names/playerName';

// Delivering a card in a simulator league (#2661). The player names a marker
// from the league, and the marker approves the card before the round counts.
// Both the web's submit action and the app's `submit-team` route call
// `submitScorecardWithMarker`, so the rule has one home (AGENTS.md trap 4).
//
// Outside a simulator league it is `submitScorecardCore` unchanged: a marker
// in the request is ignored.
//
// #2814 (the owner 10.11): the one who keeps the flight's cards delivers only
// their own, and hands the others over. They become the marker for the cards
// they kept, and each flightmate is told to look their card over and deliver
// it. A flightmate's own delivery then needs no marker: unchanged since the
// marker kept it (`unchangedSinceMarker`), it is approved on delivery;
// changed, it waits in the marker's queue. In a simulator flight `alsoFor`
// therefore reads «the cards I hand over», not «the cards I deliver».
//
// ORDER, on purpose: the marker is written before the delivery. When the
// delivery fails after that, the marker stands on a card that is not
// delivered. That does no harm: nothing reads `marker_user_id` before
// `submitted_at` is set, and the next delivery writes it again. An undo, on
// the other hand, could race the player's second tap. Same reasoning as
// `freezeRoundSettings` in the start core. The handover comes after the
// deliverer's own card is in: when it fails, the delivery stands, the page
// shows the flightmates' cards again, and the next tap hands them over.

const LOG_PREFIX = 'submitScorecardWithMarker';

export type SubmitWithMarkerResult =
  | (Extract<SubmitScorecardResult, { ok: true }> & {
      /** #2814: the flightmates' cards handed over in a simulator flight. */
      handedOver?: number;
    })
  | Extract<SubmitScorecardResult, { ok: false }>
  | { ok: false; reason: MarkerRefusal };

type MarkerWrite =
  | { ok: true; marked: boolean }
  | { ok: false; reason: MarkerRefusal | 'db' };

/** The flight game's roster as the marker rules read it. */
type RosterRow = {
  user_id: string;
  submitted_at: string | null;
  marker_user_id: string | null;
  rejection_reason: string | null;
  withdrawn_at: string | null;
};

/** Every row in the flight game, with the admin client. Throws on a failed read. */
async function readRoster(gameId: string): Promise<RosterRow[]> {
  const { data, error } = await getAdminClient()
    .from('game_players')
    .select('user_id, submitted_at, marker_user_id, rejection_reason, withdrawn_at')
    .eq('game_id', gameId)
    .returns<RosterRow[]>();
  if (error) throw new Error(`roster read failed: ${error.message}`, { cause: error });
  return data ?? [];
}

/**
 * Checks the named marker against the league and writes it on the
 * deliverer's own card. The check is `markerRefusal`, against the league's
 * members read here, so a hand-made request gets the same answer as the form.
 * The cards the deliverer kept are not in this delivery (#2814), so a
 * flightmate is a valid marker.
 *
 * Only a card that is not delivered yet is marked (`submitted_at is null`),
 * so the marker on a delivered card never moves under its marker's feet. The
 * write goes through the admin client: the column is server-owned (0220).
 * Zero rows is not an error here: the card is already in (a second tap), and
 * the delivery after it answers `alreadySubmitted`.
 */
export async function setFlightMarkerCore(opts: {
  flight: LeagueFlight;
  delivererId: string;
  markerUserId: string | null;
}): Promise<MarkerWrite> {
  const { flight, delivererId, markerUserId } = opts;
  const admin = getAdminClient();

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
    cardOwnerIds: [delivererId],
    delivererId,
  });
  if (refusal) return { ok: false, reason: refusal };

  const { data: marked, error } = await admin
    .from('game_players')
    .update({ marker_user_id: markerUserId })
    .eq('game_id', flight.gameId)
    .eq('user_id', delivererId)
    .is('submitted_at', null)
    .is('withdrawn_at', null)
    .select('user_id');
  if (error) {
    console.error(`[${LOG_PREFIX}] marker write failed`, { gameId: flight.gameId, error });
    return { ok: false, reason: 'db' };
  }
  return { ok: true, marked: (marked ?? []).length > 0 };
}

/**
 * The flightmates in `alsoFor` the deliverer kept score for, the same
 * narrowing as the core (`loadFlightDeliveryCards`, which leaves out a card
 * that already has a marker). `null` on a failed read.
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
 * Deliver the caller's card, the way `submitScorecardCore` does. In a
 * simulator league:
 *  1. the caller's own card gets the marker they named (`setFlightMarkerCore`),
 *     unless it is delivered already, a flightmate kept it and is its marker
 *     (`handedOverMarker`), or its marker sent it back (`returnedToMarker`).
 *     Then no marker is asked, and one in the request is ignored;
 *  2. the caller's card is delivered, without the flightmates' cards;
 *  3. the marker is told (`league_marker_request`), or, for a card a
 *     flightmate kept, it is approved when unchanged (`settleHandedOverCard`).
 *     A card that was sent back is never approved on delivery: it goes back
 *     to its marker (the owner 11.11);
 *  4. the cards the caller kept are handed over (`handOver`).
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
  let roster: RosterRow[] = [];
  try {
    flight = await readSimulatorLeagueFlight(gameId);
    if (flight) roster = await readRoster(gameId);
  } catch (err) {
    console.error(`[${LOG_PREFIX}] league read failed`, { gameId, err });
    return { ok: false, reason: 'db' };
  }
  if (!flight) return submitScorecardCore(supabase, gameId, userId, { alsoFor });

  // A caller who is not an active player marks nothing; the core refuses.
  const me = roster.find((p) => p.user_id === userId && p.withdrawn_at == null);
  if (!me) return submitScorecardCore(supabase, gameId, userId, { alsoFor: [], peerNotices: false });

  const keptBy = handedOverMarker(me, activeFlightmates(roster, userId));
  const returnedTo = returnedToMarker(me);
  let ownMarker: string | null = returnedTo;
  if (me.submitted_at == null && keptBy == null && returnedTo == null) {
    const marker = await setFlightMarkerCore({
      flight,
      delivererId: userId,
      markerUserId: opts.markerUserId ?? null,
    });
    if (!marker.ok) return { ok: false, reason: marker.reason };
    if (marker.marked) ownMarker = opts.markerUserId ?? null;
  }

  const result = await submitScorecardCore(supabase, gameId, userId, {
    alsoFor: [],
    peerNotices: false,
  });
  if (!result.ok) return result;

  if (!result.alreadySubmitted) {
    if (keptBy) await settleHandedOverCard(flight, userId, keptBy);
    else if (ownMarker) await notifyMarker(flight, ownMarker, [userId]);
  }
  const handedOver = await handOver(flight, userId, alsoFor);
  return { ...result, handedOver };
}

/**
 * #2814: the cards the deliverer kept, not delivered and without a marker,
 * get the deliverer as their marker, and each flightmate is told to look the
 * card over and deliver it. Only the rows the write hit are told. The notice
 * is the card's reminder, so once it went out the card is stamped and the
 * sweep does not send a second one («Et kvarter, én gang»). When the notice
 * could not be sent, the card stays unstamped and the sweep reminds the owner.
 *
 * Never fails the delivery: a failed read or write is logged, nothing is
 * handed over, and the page offers the cards again. Returns the count.
 */
async function handOver(
  flight: LeagueFlight,
  delivererId: string,
  alsoFor: readonly string[],
): Promise<number> {
  const mates = await deliverableMates(flight.gameId, delivererId, alsoFor);
  if (!mates || mates.length === 0) return 0;
  const { data, error } = await getAdminClient()
    .from('game_players')
    .update({ marker_user_id: delivererId })
    .eq('game_id', flight.gameId)
    .in('user_id', mates)
    .is('submitted_at', null)
    .is('withdrawn_at', null)
    .is('marker_user_id', null)
    .select('user_id');
  if (error) {
    console.error(`[${LOG_PREFIX}] handover failed`, { gameId: flight.gameId, error });
    return 0;
  }
  const handed = (data ?? []).map((r) => r.user_id);
  if (handed.length > 0 && (await tellHandedOver(flight, delivererId, handed))) {
    await stampReminded(flight.gameId, handed);
  }
  return handed.length;
}

/** The handover notice was the cards' reminder. Best-effort: a failed write is logged. */
async function stampReminded(gameId: string, playerIds: readonly string[]): Promise<void> {
  const { error } = await getAdminClient()
    .from('game_players')
    .update({ deliver_reminder_sent_at: new Date().toISOString() })
    .eq('game_id', gameId)
    .in('user_id', [...playerIds])
    .is('submitted_at', null);
  if (error) console.error(`[${LOG_PREFIX}] reminder stamp failed`, { gameId, error });
}

type UserRow = { id: string; email: string | null; name: string | null; nickname: string | null; locale: string | null };

/**
 * `deliver_reminder` with the marker's name to each flightmate handed a card.
 * Best-effort: false when the reads failed and nothing was sent.
 */
async function tellHandedOver(
  flight: LeagueFlight,
  markerUserId: string,
  playerIds: readonly string[],
): Promise<boolean> {
  try {
    const admin = getAdminClient();
    const [gameRes, usersRes] = await Promise.all([
      admin.from('games').select('name').eq('id', flight.gameId).single<{ name: string }>(),
      admin
        .from('users')
        .select('id, email, name, nickname, locale')
        .in('id', [markerUserId, ...playerIds])
        .returns<UserRow[]>(),
    ]);
    if (gameRes.error) throw gameRes.error;
    if (usersRes.error) throw usersRes.error;
    const byId = new Map((usersRes.data ?? []).map((u) => [u.id, u]));
    const marker = byId.get(markerUserId);
    const markerName = playerName(marker);
    await Promise.all(
      playerIds.map((playerId) => {
        const player = byId.get(playerId);
        return sendDeliveryReminder({
          player: {
            userId: playerId,
            email: player?.email ?? null,
            name: player?.name ?? null,
            locale: player?.locale ?? null,
          },
          game: { id: flight.gameId, name: gameRes.data.name },
          logPrefix: LOG_PREFIX,
          markerName,
        });
      }),
    );
    return true;
  } catch (err) {
    console.error(`[${LOG_PREFIX}] handover notice failed`, { gameId: flight.gameId, err });
    return false;
  }
}

/**
 * #2814: a flightmate delivered the card the marker kept for them. Unchanged
 * since the marker kept it, the card is approved in the marker's name, the
 * way the marker's own tap would (`approveScorecardCore`, which also finishes
 * the flight on the last approval). Changed, or when that approval fails, the
 * card waits in the marker's queue, and the marker is told. Never throws.
 */
async function settleHandedOverCard(
  flight: LeagueFlight,
  playerUserId: string,
  markerUserId: string,
): Promise<void> {
  const admin = getAdminClient();
  try {
    const { data: rows, error } = await admin
      .from('scores')
      .select('entered_by')
      .eq('game_id', flight.gameId)
      .eq('user_id', playerUserId)
      .returns<{ entered_by: string | null }[]>();
    if (error) throw error;
    if (unchangedSinceMarker(rows ?? [], markerUserId)) {
      const approved = await approveScorecardCore({
        client: admin,
        gameId: flight.gameId,
        approverUserId: markerUserId,
        playerUserId,
        approverRole: 'peer',
        delivererMayApprove: false,
        markerUserId,
      });
      if (approved.ok) return;
      console.error(`[${LOG_PREFIX}] approval of an unchanged card failed`, {
        gameId: flight.gameId,
        reason: approved.reason,
      });
    }
  } catch (err) {
    console.error(`[${LOG_PREFIX}] unchanged check failed`, { gameId: flight.gameId, err });
  }
  await notifyMarker(flight, markerUserId, [playerUserId]);
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
            player_name: playerName(row.users),
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
 * What the delivery page shows about the marker in a simulator league.
 * `options` is the picker for the caller's own card, or undefined when there is
 * none: the card is delivered, `markedBy`, the flightmate who kept it, is its
 * marker, or `returnedBy`, its marker, sent it back (#2814).
 */
export type MarkerChoice = {
  flight: LeagueFlight;
  options: MarkerOption[] | undefined;
  markedBy: MarkerOption | null;
  returnedBy: MarkerOption | null;
};

/**
 * The marker picker for a delivery, or null when the game is not a
 * simulator-league flight (no picker). The candidates are `markerCandidates`
 * over the league's members for the caller's own card, the flightmates first
 * (`orderMarkerOptions`). Read with the admin client: the members outside the
 * flight are invisible to the player's RLS client. A failed read throws (the
 * page's error boundary), never «no picker».
 */
export async function loadMarkerChoice(
  gameId: string,
  delivererId: string,
): Promise<MarkerChoice | null> {
  const flight = await readSimulatorLeagueFlight(gameId);
  if (!flight) return null;
  const [{ data, error }, roster] = await Promise.all([
    getAdminClient()
      .from('league_players')
      .select('user_id, users!league_players_user_id_fkey(name, nickname)')
      .eq('league_id', flight.leagueId)
      .returns<{ user_id: string; users: { name: string | null; nickname: string | null } | null }[]>(),
    readRoster(gameId),
  ]);
  if (error) throw new Error(`loadMarkerChoice: ${error.message}`);
  const nameOf = new Map(
    (data ?? []).map((m) => [m.user_id, playerName(m.users)]),
  );
  const me = roster.find((p) => p.user_id === delivererId);
  const mates = activeFlightmates(roster, delivererId);
  const option = (userId: string): MarkerOption => ({ userId, name: nameOf.get(userId) ?? null });
  const keptBy = me ? handedOverMarker(me, mates) : null;
  if (keptBy) return { flight, options: undefined, markedBy: option(keptBy), returnedBy: null };
  const returnedTo = me ? returnedToMarker(me) : null;
  if (returnedTo) return { flight, options: undefined, markedBy: null, returnedBy: option(returnedTo) };
  if (me?.submitted_at != null) return { flight, options: undefined, markedBy: null, returnedBy: null };
  const options = orderMarkerOptions(
    markerCandidates([...nameOf.keys()], [delivererId], delivererId).map((userId) => ({
      userId,
      name: nameOf.get(userId) ?? null,
    })),
    mates,
  );
  return { flight, options, markedBy: null, returnedBy: null };
}
