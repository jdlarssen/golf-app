import 'server-only';
import {
  approveRegistrationCore,
  loadRegistrationDecision,
  rejectRegistrationCore,
  type DecisionFailure,
} from '@/lib/games/registrationDecisionCore';
import type { getServerClient } from '@/lib/supabase/server';
import { archiveNotifications } from './archive';
import { markSettledRead } from './markRead';

export type DecideRegistrationResult =
  | { ok: true; outcome: 'approved' | 'rejected'; gameName: string; teamName: string | null }
  | { ok: false; reason: DecisionFailure | 'error' };

/**
 * «Godta» / «Avslå» on a signup request in the inbox (#2263, owner's answer
 * 13), moved here so the web's action and the app's route run the same thing
 * (#2759). The same core as the signup page, so the same rule decides who may
 * answer (an admin, or the game's organiser — #2440), and a captain's request
 * takes the whole team. A decline from the inbox carries no reason.
 *
 * Afterwards the varsel has done its job: archived on success, marked read
 * when the request was already settled or its game has started. Both best-effort — if they fail, the
 * next visit sees the request is no longer pending and treats it as read.
 * Anything the core throws (a read error) is `{ ok: false, reason: 'error' }`
 * and the client rolls back.
 *
 * `client` reads as the caller: the cookie client on the web, the token client
 * in the app's route. The caller has checked the ids.
 */
export async function decideFromInbox(opts: {
  client: Awaited<ReturnType<typeof getServerClient>>;
  userId: string;
  notificationId: string;
  requestId: string;
  decision: 'approve' | 'reject';
}): Promise<DecideRegistrationResult> {
  const { client, userId, notificationId, requestId, decision } = opts;

  let result;
  try {
    const loaded = await loadRegistrationDecision(client, requestId);
    result = !loaded.ok
      ? loaded
      : decision === 'approve'
        ? await approveRegistrationCore(loaded.ctx)
        : await rejectRegistrationCore(loaded.ctx, '');
  } catch (err) {
    console.error('[innboks] decideRegistration failed', err);
    return { ok: false, reason: 'error' };
  }

  if (result.ok) {
    await archiveNotifications({ userId, notificationId, client });
    return {
      ok: true,
      outcome: result.outcome,
      gameName: result.gameName,
      teamName: result.teamName,
    };
  }
  // Settled from here: answered elsewhere, gone, or the round has started
  // (a started game locks the roster for good). Mark the varsel read so it
  // leaves «Krever handling» instead of failing on every tap.
  if (
    result.reason === 'not_pending' ||
    result.reason === 'request_not_found' ||
    result.reason === 'game_not_found' ||
    result.reason === 'game_locked'
  ) {
    await markSettledRead({ userId, ids: [notificationId] });
  }
  return { ok: false, reason: result.reason };
}
