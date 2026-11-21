import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { isDisposableEmailDomain } from '@/lib/auth/disposableEmail';
import { inviteExpiresAtFromNow } from '@/lib/auth/inviteExpiry';
import { getQuotaState } from '@/lib/invitations/quota';
import { sendInviteNotification } from '@/lib/mail/inviteNotification';
import { notify } from '@/lib/notifications/notify';
import { getAdminClient } from '@/lib/supabase/admin';
import { displayNameForOthers } from '@/lib/users/displayName';
import { getPrivateUserFields } from '@/lib/users/privateUserFields';
import {
  asFriendStatus as asStatus,
  type AddByEmailStatus,
  type FriendStatus,
  type InviteStatus,
} from './friendStatus';

export type { AddByEmailStatus, FriendStatus, InviteStatus };

/**
 * Vennehandlingene (#2256): ett hjem for det webbens server-handlinger og
 * appens serverruter gjør (AGENTS felle 4).
 *
 * Hver funksjon tar kallerens EGEN klient og bruker-id. RPC-ene
 * (`send_friend_request` m.fl., 0077) er security definer og leser
 * `auth.uid()`, så de må kjøres med kallerens token. Varslene og
 * navneoppslagene går via admin-klienten, fordi `users` ikke er lesbar for
 * andre (users-RLS-gapet). Det er grunnen til at appen ikke kan gjøre dette
 * selv, og må gå via serverrutene under `app/api/friends/`.
 *
 * Svaret er en status, aldri et kast: de samme kodene webben alltid har brukt
 * i `?status=`, og appen oversetter dem til tekst. Skallene over (redirect på
 * webben, JSON i ruta) gjør ingenting annet enn å bære statusen videre.
 */

type Client = SupabaseClient<Database>;

/**
 * Visningsnavn for varsel-payload: nickname-dekorert navn → maskert e-post
 * (#2271 — mottakeren ser aldri hele adressen).
 * Returnerer null (ikke norsk fallback) når vi ikke finner brukeren — render-
 * tid fallback i buildNotificationText bruker katalog-strengen i riktig locale.
 */
async function getDisplayName(userId: string): Promise<string | null> {
  const { data } = await getAdminClient()
    .from('users')
    .select('name, nickname, email')
    .eq('id', userId)
    .maybeSingle<{ name: string | null; nickname: string | null; email: string }>();
  if (!data) return null;
  return displayNameForOthers(data);
}

/**
 * Best-effort venne-varsel. Aldri blokker bruker-flyten.
 *
 * `via` (#2263) sier hvordan vennskapet ble til: `accept` når den andre godtok
 * en forespørsel, `link` når noen åpnet venne-lenka (innboksen sier da «la deg
 * til som venn»).
 */
async function notifyFriend(
  targetId: string,
  kind: 'friend_request' | 'friend_accepted',
  actorId: string,
  via: 'accept' | 'link' = 'accept',
): Promise<void> {
  try {
    const actorName = await getDisplayName(actorId);
    await notify({
      userId: targetId,
      kind,
      // actor_name may be null — buildNotificationText renders the catalog fallback
      // at render time in the correct locale (§4 payload-fallback contract).
      payload:
        kind === 'friend_accepted'
          ? { actor_id: actorId, actor_name: actorName, via }
          : { actor_id: actorId, actor_name: actorName },
    });
  } catch (err) {
    console.error('[venner] notify failed', err);
  }
}

/**
 * Map RPC-status → varsel som skal sendes til target. 'requested' →
 * mottaker får friend_request; 'accepted' (omvendt pending ble godtatt) →
 * den opprinnelige avsenderen får friend_accepted.
 */
async function notifyForStatus(
  status: FriendStatus,
  targetId: string,
  actorId: string,
): Promise<void> {
  if (status === 'requested') {
    await notifyFriend(targetId, 'friend_request', actorId);
  } else if (status === 'accepted') {
    await notifyFriend(targetId, 'friend_accepted', actorId);
  }
}

/** Send venneforespørsel til en kjent bruker-id (fra co-player-forslag). */
export async function sendRequest(
  client: Client,
  userId: string,
  addresseeId: string,
): Promise<FriendStatus> {
  if (!addresseeId) return 'error';
  const { data, error } = await client.rpc('send_friend_request', {
    p_addressee: addresseeId,
  });
  if (error) {
    console.error('[venner] send_friend_request failed', error);
    return 'error';
  }
  const status = asStatus(data);
  await notifyForStatus(status, addresseeId, userId);
  return status;
}

/**
 * Godta eller avslå en innkommende forespørsel. Ved godkjenning varsles
 * avsenderen (friend_accepted).
 */
export async function respond(
  client: Client,
  userId: string,
  requestId: string,
  accept: boolean,
): Promise<FriendStatus> {
  if (!requestId) return 'error';

  // Hent avsender-id før avgjørelsen (raden slettes ved avslag).
  const { data: row } = await getAdminClient()
    .from('friendships')
    .select('requester_id')
    .eq('id', requestId)
    .maybeSingle<{ requester_id: string }>();

  const { data, error } = await client.rpc('respond_friend_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) {
    console.error('[venner] respond_friend_request failed', error);
    return 'error';
  }
  const status = asStatus(data);
  if (status === 'accepted' && row?.requester_id) {
    await notifyFriend(row.requester_id, 'friend_accepted', userId);
  }
  return status;
}

/**
 * Bli venn via «legg til meg»-lenka (#369): den som åpner lenka, kobles som
 * venn med eieren med en gang (eieren inviterte ved å dele, åpneren godtar ved
 * å trykke). `connect_via_friend_code` (0077) er idempotent og svarer `self`,
 * `already_friends` eller `connected`; `connected` blir `accepted` her, og
 * bare da varsles eieren. En ukjent kode får RPC-en til å kaste, og det blir
 * `error`, som enhver annen feil.
 */
export async function connectByFriendCode(
  client: Client,
  userId: string,
  code: string,
): Promise<FriendStatus> {
  if (!code) return 'error';
  const { data, error } = await client.rpc('connect_via_friend_code', { p_code: code });
  if (error) {
    console.error('[venner] connect_via_friend_code failed', error);
    return 'error';
  }
  const result = (data ?? {}) as { owner_id?: string; status?: string };
  if (result.status !== 'connected') return asStatus(result.status);
  if (result.owner_id) await notifyFriend(result.owner_id, 'friend_accepted', userId, 'link');
  return 'accepted';
}

/**
 * Fjern en venn ELLER trekk tilbake en utgående/innkommende forespørsel.
 * Ingen varsel — fjerning er stille.
 */
export async function remove(client: Client, otherId: string): Promise<FriendStatus> {
  if (!otherId) return 'error';
  const { data, error } = await client.rpc('remove_friend', { p_other: otherId });
  if (error) {
    console.error('[venner] remove_friend failed', error);
    return 'error';
  }
  return asStatus(data);
}

// ── Legg til venn på e-post ─────────────────────────────────────────────────

// Lightweight format check. We rely on browser `type="email"` + the
// fact that Supabase will reject malformed addresses too. Just guard
// against trivially-empty / no-@ submissions here.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Det som er galt med adressen før noen spørres, eller `null`.
 */
export function inviteEmailProblem(
  email: string,
): 'email_required' | 'invalid_email' | 'disposable_email' | null {
  if (!email) return 'email_required';
  if (!looksLikeEmail(email)) return 'invalid_email';
  // #422: reject known disposable/throwaway inbox domains on the user-driven
  // invite flows. Unlike the /login block (#365), this is always on — a
  // disposable invitation never has value: with self-reg off it lets an
  // invited throwaway address create an account, and with self-reg on it just
  // leaves a dead invitations row + a wasted notification mail. Admin/trusted-
  // creator invite flows are deliberately not guarded (owner decision, #422).
  if (isDisposableEmailDomain(email)) return 'disposable_email';
  return null;
}

/** Runs a task after the answer is on its way (`after` from `next/server`). */
export type Defer = (task: () => Promise<void>) => void;

type LookupOutcome =
  | 'unknown'
  | 'self'
  | 'already_sent'
  | 'already_friends'
  | 'accepted'
  | 'requested'
  | 'already_pending';

const LOOKUP_OUTCOMES: readonly string[] = [
  'unknown',
  'self',
  'already_sent',
  'already_friends',
  'accepted',
  'requested',
  'already_pending',
];

/**
 * Legg til venn på e-post (0252). Én handling, og ett svar for alle adresser:
 * `requested`. Har adressen en konto, får personen en venneforespørsel. Har
 * den ikke, får adressen en invitasjon på e-post. Den som spør, får ikke vite
 * hvilken av de to som skjedde, verken av svaret eller av det hen selv kan
 * lese etterpå:
 *
 * - Hver adresse gir én rad i `invitations` (den teller på dagskvoten), uansett.
 *   Raden skrives i samme transaksjon som forespørselen.
 * - Forespørselen (`friendships.by_email`) leses av mottakeren. Avsenderen ser
 *   den først når den er godtatt.
 * - Oppslaget gjøres av tjenesterollen (`friend_request_by_email`), og
 *   utfallet forlater aldri serveren.
 * - Varselet og e-posten sendes etter at svaret er gitt (`defer`), så svaret
 *   tar like lang tid begge veier.
 *
 * Det som stopper handlingen før oppslaget, avhenger bare av den som spør og
 * av adressen slik den er skrevet: tom eller ugyldig adresse, engangsadresse,
 * ufullført profil, brukt kvote, egen adresse.
 */
export async function addByEmail(
  client: Client,
  userId: string,
  rawEmail: string,
  defer: Defer,
): Promise<AddByEmailStatus> {
  const email = rawEmail.trim().toLowerCase();
  const problem = inviteEmailProblem(email);
  if (problem) return problem;

  try {
    // Migration 0014 ensures the row always exists for authenticated users,
    // so we gate on `profile_completed_at` rather than "row missing" (#1445).
    const { data: profile, error: profileError } = await client
      .from('users')
      .select('name, profile_completed_at')
      .eq('id', userId)
      .single<{ name: string | null; profile_completed_at: string | null }>();
    if (profileError || !profile) {
      if (profileError) console.error('[venner] own profile lookup failed', profileError);
      return 'error';
    }
    if (!profile.profile_completed_at) return 'profile_incomplete';

    const own = (await getPrivateUserFields([userId])).get(userId);
    if (own && own.email.trim().toLowerCase() === email) return 'self';

    // The daily limit holds for every address, so the count says nothing
    // about who has an account.
    const quota = await getQuotaState(client, userId);
    if (quota.isExhausted) return 'quota';

    // Shared cross-door dedup (#348): an address someone else has an open
    // invitation to gets no second mail. Read before our own row lands.
    const { data: invitedElsewhere, error: invitedError } = await client.rpc('email_is_invited', {
      check_email: email,
    });
    if (invitedError) {
      console.error('[venner] email_is_invited failed', invitedError);
      return 'error';
    }

    // The lookup and the sender's receipt are one call and one transaction
    // (0252): the request and the receipt row both land, or neither does.
    // Token is required NOT NULL UNIQUE; the actual OTP code is sent by
    // Supabase when the invitee reaches /login and asks for one.
    const expiresAt = inviteExpiresAtFromNow();
    const inviteToken = randomUUID();
    const { data: lookup, error: lookupError } = await getAdminClient().rpc(
      'friend_request_by_email',
      { p_requester: userId, p_email: email, p_token: inviteToken, p_expires_at: expiresAt },
    );
    if (lookupError) {
      console.error('[venner] friend_request_by_email failed', lookupError);
      return 'error';
    }
    const result = (lookup ?? {}) as { outcome?: string; target_id?: string | null };
    if (!result.outcome || !LOOKUP_OUTCOMES.includes(result.outcome)) {
      console.error('[venner] friend_request_by_email gave an unknown outcome');
      return 'error';
    }
    const outcome = result.outcome as LookupOutcome;
    if (outcome === 'self') return 'self';
    // Asked this address already, and the receipt is still open: the answer
    // is the same and nothing is sent twice.
    if (outcome === 'already_sent') return 'requested';

    // null → «En venn» in the recipient's language (the mail fills it in).
    const inviterName = profile.name?.trim() || null;
    const targetId = result.target_id ?? null;
    defer(async () => {
      if (outcome === 'unknown') {
        if (invitedElsewhere) return;
        // Best-effort: a mail failure doesn't roll back the invitation.
        try {
          await sendInviteNotification({
            to: email,
            invitedByName: inviterName,
            inviterFallback: 'friend',
            inviteToken,
            expiresAt,
          });
        } catch (err) {
          console.error('[venner] invitation mail failed', err);
        }
      } else if (targetId && (outcome === 'requested' || outcome === 'accepted')) {
        await notifyForStatus(outcome, targetId, userId);
      }
    });
    return 'requested';
  } catch (err) {
    console.error('[venner] addByEmail failed', err);
    return 'error';
  }
}

/**
 * `POST /api/friends/invite`, kalt av appbygg fra før 0252 etter et
 * «ikke på Tørny»-svar. Det svaret finnes ikke lenger, og ruta gjør nå det
 * samme som «Legg til venn på e-post», med invitasjonskodene de byggene
 * kjenner.
 */
export async function inviteByEmail(
  client: Client,
  userId: string,
  rawEmail: string,
  defer: Defer,
): Promise<{ status: InviteStatus; email: string }> {
  const email = rawEmail.trim().toLowerCase();
  const status = await addByEmail(client, userId, email, defer);
  if (status === 'requested') return { status: 'invited', email };
  if (status === 'self' || status === 'error') return { status: 'unknown', email };
  return { status, email };
}
