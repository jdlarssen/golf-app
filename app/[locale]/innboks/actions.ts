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
import { expectAffected } from '@/lib/supabase/affectedRows';
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
 * notification-id-en til den raden brukeren tappet — vi rør IKKE entityId
 * eller kind her, så et tap på «invite for Hauger Open» markerer bare det
 * ene varselet (ikke alle invite-varsler for det spillet).
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
 * Marker alle uleste varsler for current user som lest. Brukes fra
 * «Marker alle som lest»-knappen øverst i /innboks.
 */
export async function markAllAsRead(): Promise<InboxActionResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false };
  return { ok: await markNotificationsRead({ userId }) };
}

/** A group row covers at most this many notifications (the inbox reads 600). */
const MAX_GROUP_IDS = 100;

/**
 * Mark the rows behind one group row read (#2263): «4 scorekort levert»,
 * «3 nye påmeldinger», a read approval group. By id, never by kind + game —
 * see `markNotificationIdsRead`. The ids come from the client, so they are
 * checked (uuid shape, at most 100), and the write is scoped to the proxy's
 * user: someone else's id simply matches nothing.
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
 * answer (global admin), and a captain's request takes the whole team. A
 * decline from the inbox carries no reason.
 *
 * Afterwards the varsel has done its job: archived on success, marked read
 * when the request was already settled. Both best-effort — if they fail, the
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
  if (
    result.reason === 'not_pending' ||
    result.reason === 'request_not_found' ||
    result.reason === 'game_not_found'
  ) {
    await markNotificationsRead({ userId, notificationId });
  }
  return { ok: false, reason: result.reason };
}

/**
 * Arkiver ett spesifikt varsel (✕-knapp per kort, #616). Soft-archive:
 * raden skjules fra lista men slettes ikke. Setter også `read_at` så en
 * arkivert-mens-ulest rad ikke etterlater en hengende bunn-nav-prikk.
 *
 * UserId hentes via proxy-header, ikke fra klienten — klienten kan ikke be
 * om å arkivere noen andres varsler.
 */
export async function archiveOne(
  notificationId: string,
): Promise<InboxActionResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false };
  return { ok: await archiveNotifications({ userId, notificationId }) };
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

/**
 * Skru månedsbrevet (product-updates, #202) på eller av. Eierskapet flyttet
 * hit fra profil-skjemaet (#401) siden det er en varsel-innstilling, ikke en
 * golfprofil-greie. `null` = på (default), timestamp = av-meldt da.
 *
 * Skrivingen verifiseres med `expectAffected` (AGENTS.md trap 2): PostgREST
 * returnerer `error == null` for en UPDATE som traff 0 rader, så uten
 * `.select('id')` + radtelling ville en RLS-nekt se ut som suksess og
 * bryteren bli stående av mens samtykket i DB-en var uendret (#1394). Et
 * samtykke-signal må være til å stole på, så vi svelger ingen 0-rads-skriving.
 */
export async function toggleProductUpdates(
  optIn: boolean,
): Promise<InboxActionResult> {
  const userId = await getProxyVerifiedUserId();
  if (!userId) return { ok: false };
  const supabase = await getServerClient();
  try {
    expectAffected(
      await supabase
        .from('users')
        .update({
          product_updates_unsubscribed_at: optIn
            ? null
            : new Date().toISOString(),
        })
        .eq('id', userId)
        .select('id'),
      'toggleProductUpdates',
    );
  } catch (err) {
    // Best-effort som resten av innboks-handlingene: vi kaster ikke videre til
    // klienten, men rapporterer ok=false så bryteren ruller tilbake.
    console.error('[innboks] toggleProductUpdates failed', err);
    return { ok: false };
  }
  return { ok: true };
}
