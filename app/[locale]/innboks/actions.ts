'use server';

import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import {
  markNotificationIdsRead,
  markNotificationsRead,
} from '@/lib/notifications/markRead';
import { archiveNotifications } from '@/lib/notifications/archive';
import {
  approveRegistrationCore,
  loadRegistrationDecision,
  rejectRegistrationCore,
  type DecisionFailure,
} from '@/lib/games/registrationDecisionCore';
import { getServerClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/url/isUuid';

/**
 * Utfallet av en innboks-handling. `ok: false` betyr at INGENTING ble lagret —
 * enten fordi brukeren ikke er innlogget, eller fordi DB-en avviste skrivingen.
 * Klienten ruller da tilbake den optimistiske state-en og sier fra (#1394);
 * før dette svelget både helperne og actionene feilen og UI-et løy.
 */
export type InboxActionResult = { ok: boolean };

/**
 * Marker ett spesifikt varsel som lest. Caller (InboxClient) sender alltid
 * notification-id-en til den raden brukeren tappet, og actionen merker bare
 * den ene id-en: et tap på «invite for Hauger Open» markerer bare det ene
 * varselet (ikke alle invite-varsler for det spillet).
 *
 * UserId hentes via proxy-header, ikke fra klienten — sikkerhetshygiene
 * (klienten kan ikke be om å markere noen andres varsler).
 */
export async function markOneAsRead(
  notificationId: string,
): Promise<InboxActionResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false };
  return { ok: await markNotificationsRead({ userId, notificationId }) };
}

/**
 * A push tap marks exactly the tapped notification read (#2201). The push
 * link carries `?varsel=<id>`; `PwaBoot` reads it on page load and calls this.
 * The id comes from the address bar, so it must be a uuid; the user id comes
 * from the proxy, as in `markOneAsRead`, so the write only ever touches the
 * caller's own rows (someone else's id matches nothing). The page's own
 * mark-read usually got there first, so 0 rows is fine and stays silent.
 */
export async function markLinkedAsRead(
  notificationId: string,
): Promise<InboxActionResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId || typeof notificationId !== 'string' || !isUuid(notificationId)) {
    return { ok: false };
  }
  return {
    ok: await markNotificationsRead({ userId, notificationId, zeroRowsOk: true }),
  };
}

/**
 * Marker alle uleste varsler for current user som lest. Brukes fra
 * «Marker alle som lest»-knappen øverst i /innboks.
 */
export async function markAllAsRead(): Promise<InboxActionResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false };
  return { ok: await markNotificationsRead({ userId }) };
}

/**
 * The inbox shows at most 600 rows (500 unread + 100 read), so no group holds
 * more; anything longer is not from the inbox. The write itself goes in
 * slices of 100 (`markNotificationIdsRead`).
 */
const MAX_GROUP_IDS = 600;

/**
 * Mark the rows behind one group row read (#2263): «4 scorekort levert»,
 * «3 nye påmeldinger», a read approval group. By id, never by kind + game —
 * see `markNotificationIdsRead`. The ids come from the client, so they are
 * checked (uuid shape, at most what the inbox can show), and the write is
 * scoped to the proxy's user: someone else's id simply matches nothing.
 */
export async function markGroupAsRead(ids: string[]): Promise<InboxActionResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false };
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_GROUP_IDS ||
    !ids.every((id) => typeof id === 'string' && isUuid(id))
  ) {
    return { ok: false };
  }
  return { ok: await markNotificationIdsRead({ userId, ids }) };
}

export type DecideRegistrationResult =
  | { ok: true; outcome: 'approved' | 'rejected'; gameName: string; teamName: string | null }
  | { ok: false; reason: DecisionFailure | 'error' };

/**
 * «Godta» / «Avslå» on a signup request in the inbox (#2263, owner's answer
 * 13). The same core as the signup page, so the same rule decides who may
 * answer (an admin, or the game's organiser — #2440), and a captain's request
 * takes the whole team. A decline from the inbox carries no reason.
 *
 * Afterwards the varsel has done its job: archived on success, marked read
 * when the request was already settled or its game has started. Both best-effort — if they fail, the
 * next visit sees the request is no longer pending and treats it as read.
 * Anything the core throws (a read error) is `{ ok: false, reason: 'error' }`
 * and the client rolls back.
 */
export async function decideRegistration(
  notificationId: string,
  requestId: string,
  decision: 'approve' | 'reject',
): Promise<DecideRegistrationResult> {
  const userId = await getProxyVerifiedUserId();
  if (
    !userId ||
    !isUuid(notificationId) ||
    !isUuid(requestId) ||
    (decision !== 'approve' && decision !== 'reject')
  ) {
    return { ok: false, reason: 'error' };
  }

  let result;
  try {
    const loaded = await loadRegistrationDecision(await getServerClient(), requestId);
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
    await archiveNotifications({ userId, notificationId });
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
    await markNotificationsRead({ userId, notificationId });
  }
  return { ok: false, reason: result.reason };
}

/**
 * Arkiver alle LESTE varsler for current user («Tøm leste»-knapp, #616).
 * Uleste røres ikke — de blir stående til brukeren leser eller arkiverer dem.
 */
export async function clearRead(): Promise<InboxActionResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false };
  return { ok: await archiveNotifications({ userId }) };
}
