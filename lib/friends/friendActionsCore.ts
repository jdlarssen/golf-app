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
import { asFriendStatus as asStatus, type FriendStatus, type InviteStatus } from './friendStatus';

export type { FriendStatus, InviteStatus };

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
 * tid fallback i NotificationCard bruker katalog-strengen i riktig locale.
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

/** Best-effort venne-varsel. Aldri blokker bruker-flyten. */
async function notifyFriend(
  targetId: string,
  kind: 'friend_request' | 'friend_accepted',
  actorId: string,
): Promise<void> {
  try {
    const actorName = await getDisplayName(actorId);
    await notify({
      userId: targetId,
      kind,
      // actor_name may be null — NotificationCard renders the catalog fallback
      // at render time in the correct locale (§4 payload-fallback contract).
      payload: { actor_id: actorId, actor_name: actorName },
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
 * Legg til venn på e-post. Finnes brukeren → forespørsel. Ukjent e-post →
 * `not_found`, så flaten kan tilby å invitere på samme adresse.
 */
export async function addByEmail(
  client: Client,
  userId: string,
  rawEmail: string,
): Promise<FriendStatus> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return 'email_required';
  const { data, error } = await client.rpc('send_friend_request_by_email', {
    p_email: email,
  });
  if (error) {
    console.error('[venner] send_friend_request_by_email failed', error);
    return 'error';
  }
  const result = (data ?? {}) as { status?: string; target_id?: string | null };
  const status = asStatus(result.status);
  if (status !== 'not_found' && result.target_id) {
    await notifyForStatus(status, result.target_id, userId);
  }
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

// ── Invitasjon til en som ikke er på Tørny ──────────────────────────────────

// Lightweight format check. We rely on browser `type="email"` + the
// fact that Supabase will reject malformed addresses too. Just guard
// against trivially-empty / no-@ submissions here.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Det som er galt med adressen før noen spørres, eller `null`. Webbens skall
 * sjekker dette før innloggingen, slik handlingen alltid har gjort.
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

/**
 * Inviter en adresse som ikke er på Tørny. Vernet er det samme som webben
 * alltid har hatt: adressesjekkene, fullført profil, invitasjonskvoten og at
 * adressen ikke alt har en konto eller en åpen invitasjon.
 */
export async function inviteByEmail(
  client: Client,
  userId: string,
  rawEmail: string,
): Promise<{ status: InviteStatus; email: string }> {
  const email = rawEmail.trim().toLowerCase();
  const done = (status: InviteStatus) => ({ status, email });

  const problem = inviteEmailProblem(email);
  if (problem) return done(problem);

  // Look up inviter profile. If the inviter hasn't completed their own
  // profile, send them there first — same defensive pattern as /profile.
  // Migration 0014 ensures the row always exists for authenticated users,
  // so we gate on `profile_completed_at` rather than "row missing".
  const { data: profile, error: profileError } = await client
    .from('users')
    .select('name, profile_completed_at')
    .eq('id', userId)
    .single<{ name: string | null; profile_completed_at: string | null }>();

  // Best-effort by design (#1445): migrasjon 0014 garanterer at raden finnes
  // for en autentisert bruker, så «mangler rad» og «oppslaget feilet» er begge
  // uventede tilstander med samme svar til brukeren — en generisk beskjed.
  // Feilen logges så den ikke forsvinner.
  if (profileError || !profile) {
    if (profileError) {
      console.error('[sendFriendInvite] inviter profile lookup failed', profileError);
    }
    return done('unknown');
  }
  if (!profile.profile_completed_at) return done('profile_incomplete');

  // Defensive quota re-check — the /invite page already gates on this,
  // but server-side enforcement is what actually protects the rule.
  const quota = await getQuotaState(client, userId);
  if (quota.isExhausted) return done('quota');

  // Block invites to addresses that already exist anywhere in Tørny.
  // We check two sources in parallel:
  //   1. public.users (email_is_registered) — accounts that completed
  //      /complete-profile and have a row in the public schema.
  //   2. auth.users (email_is_in_auth_users) — accounts that exist in
  //      Supabase Auth but never finished /complete-profile (e.g. leftover
  //      from the legacy magic-link flow). Without this second check those
  //      partial accounts would slip through and receive a confusing invite
  //      mail, and their user_metadata.inviter_name would be overwritten
  //      by the subsequent signInWithOtp call.
  // The third check is the shared cross-door dedup (#348): email_is_invited
  // is the same SECURITY DEFINER RPC the admin door and the login flow use,
  // so it sees open invitations regardless of who created them — which a
  // direct `invitations` query couldn't (RLS 0020 hides other users' rows).
  const [registeredResult, inAuthResult, invitedResult] = await Promise.all([
    client.rpc('email_is_registered', { p_email: email }),
    client.rpc('email_is_in_auth_users', { email_to_check: email }),
    client.rpc('email_is_invited', { check_email: email }),
  ]);

  if (registeredResult.error || inAuthResult.error || invitedResult.error) {
    return done('unknown');
  }
  if (registeredResult.data || inAuthResult.data) return done('already_user');
  // An open invitation already exists for this address (from the admin door
  // or another friend-invite) — don't send a second invite-mail.
  if (invitedResult.data) return done('already_invited');

  const inviterName = profile.name?.trim() || 'En venn';

  // Audit log. Token is required NOT NULL UNIQUE; we generate a uuid here
  // just to satisfy the column. The actual OTP code is sent by Supabase
  // when the invitee reaches /login and asks for one.
  const expiresAt = inviteExpiresAtFromNow();
  const inviteToken = randomUUID();
  const { error: insertError } = await client.from('invitations').insert({
    email,
    token: inviteToken,
    invited_by: userId,
    game_id: null,
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error('[sendFriendInvite] invitation insert failed', insertError);
    return done('unknown');
  }

  // Send the "you've been invited" notification. The OTP code itself is
  // sent later by Supabase when the invitee reaches /login. Best-effort:
  // a mail failure doesn't roll back the invitation.
  try {
    await sendInviteNotification({
      to: email,
      invitedByName: inviterName,
      inviteToken,
      expiresAt,
    });
  } catch (err) {
    console.error('[invite] notification mail failed', err);
  }

  return done('invited');
}
