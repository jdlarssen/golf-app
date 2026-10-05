import { deliveryCounts, endGameReadiness } from './organizerDesk';

// Who hears what about a round, as the organiser (#2203, the owner's choice
// 2026-09-25): every delivery, one «Alle har levert» when the round can be
// finished, and one reminder when an active round has stood still for a day.
// The round never finishes itself. Pure rules; the sending lives in
// `lib/notifications/organizerNotices.ts`.

/** A round stands still once nothing has happened in it for this long. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Do «Alle har levert» and the stale reminder apply to this game?
 *
 *  - No organiser (`created_by` null): nobody to tell.
 *  - A cup match: the cup finishes as a whole (`finishTournament`), not match
 *    by match, so neither message has anything to ask for. The delivery
 *    notice still goes to the match's creator (`deliveryNoticeRecipient`).
 *  - A derived game: it never has deliveries of its own.
 *
 * A league flight is in: its creator is the player who started it, and they
 * finish it themselves.
 */
export function organizerNoticesApply(game: {
  created_by: string | null;
  tournament_id: string | null;
  source_game_id: string | null;
}): boolean {
  return game.created_by != null && game.tournament_id == null && game.source_game_id == null;
}

/**
 * Who gets `scorecard_submitted` for one delivered card: the organiser, or
 * nobody. Never every admin (the owner's choice: admin slipper).
 *
 * Nobody when the organiser
 *  - delivered it (their own card, or a flightmate's, #2200);
 *  - is on the card (`cardMemberIds`: the card's owner, or every row of the
 *    team in a one-ball team format, where a teammate's delivery delivers the
 *    organiser's card too);
 *  - approves it (`peerIds`): `peer_approval_request` already asks them, and
 *    that is the one that needs doing.
 */
export function deliveryNoticeRecipient(input: {
  createdBy: string | null;
  delivererId: string;
  cardMemberIds: readonly string[];
  peerIds: readonly string[];
}): string | null {
  const { createdBy } = input;
  if (createdBy == null) return null;
  if (createdBy === input.delivererId) return null;
  if (input.cardMemberIds.includes(createdBy)) return null;
  if (input.peerIds.includes(createdBy)) return null;
  return createdBy;
}

/**
 * Every active card is in, and approved when the game requires it: the
 * finish bar's `ready`. A thin wrap over the desk's count, never a third
 * count (`organizerDesk.ts`). With peer approval the round is ready only once
 * the last card is approved, since «Avslutt spillet» refuses a card that
 * waits (`finishGate`). Everyone withdrawn is `no_active`, not ready.
 */
export function allDelivered(
  players: readonly {
    submitted_at: string | null;
    approved_at: string | null;
    withdrawn_at: string | null;
  }[],
  requirePeerApproval: boolean,
): boolean {
  return endGameReadiness(deliveryCounts(players, requirePeerApproval)) === 'ready';
}

/**
 * Has the round stood still for a day? The last activity is the newest of the
 * start, the last entered score, and the last delivery, approval or
 * withdrawal on the roster (`lastRosterActivityAt`). Approvals and
 * withdrawals count, or a last approval could give «Alle har levert» and the
 * reminder in the same hour. A round that never started never stands still.
 */
export function isStale(input: {
  startedAt: string | null;
  lastScoreAt: string | null;
  lastRosterActivityAt: string | null;
  now: number;
}): boolean {
  if (input.startedAt == null) return false;
  const last = Math.max(
    ...[input.startedAt, input.lastScoreAt, input.lastRosterActivityAt]
      .filter((iso): iso is string => iso != null)
      .map((iso) => Date.parse(iso)),
  );
  return input.now - last >= STALE_AFTER_MS;
}
