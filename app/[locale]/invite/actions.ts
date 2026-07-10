'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { isDisposableEmailDomain } from '@/lib/auth/disposableEmail';
import { getQuotaState } from '@/lib/invitations/quota';
import { sendInviteNotification } from '@/lib/mail/inviteNotification';
import type { AppLocale } from '@/i18n/routing';

// Lightweight format check. We rely on browser `type="email"` + the
// fact that Supabase will reject malformed addresses too. Just guard
// against trivially-empty / no-@ submissions here.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sendFriendInvite(formData: FormData) {
  const locale = (await getLocale()) as AppLocale;
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email) {
    redirect({ href: '/profile?invite_error=email_required', locale });
  }
  if (!looksLikeEmail(email)) {
    redirect({ href: '/profile?invite_error=invalid_email', locale });
  }
  // #422: reject known disposable/throwaway inbox domains on the user-driven
  // invite flows. Unlike the /login block (#365), this is always on — a
  // disposable invitation never has value: with self-reg off it lets an
  // invited throwaway address create an account, and with self-reg on it just
  // leaves a dead invitations row + a wasted notification mail. Admin/trusted-
  // creator invite flows are deliberately not guarded (owner decision, #422).
  if (isDisposableEmailDomain(email)) {
    redirect({ href: '/profile?invite_error=disposable_email', locale });
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect({ href: '/login', locale });
    return; // unreachable — i18n redirect throws but isn't typed `never`
  }

  // Look up inviter profile. If the inviter hasn't completed their own
  // profile, send them there first — same defensive pattern as /profile.
  // Migration 0014 ensures the row always exists for authenticated users,
  // so we gate on `profile_completed_at` rather than "row missing".
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name, profile_completed_at')
    .eq('id', user.id)
    .single<{ name: string | null; profile_completed_at: string | null }>();

  if (profileError || !profile) {
    redirect({ href: '/profile?invite_error=unknown', locale });
    return;
  }
  if (!profile.profile_completed_at) {
    redirect({ href: '/complete-profile', locale });
  }

  // Defensive quota re-check — the /invite page already gates on this,
  // but server-side enforcement is what actually protects the rule.
  const quota = await getQuotaState(supabase, user.id);
  if (quota.isExhausted) {
    redirect({ href: '/profile?invite_error=quota', locale });
  }

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
    supabase.rpc('email_is_registered', { p_email: email }),
    supabase.rpc('email_is_in_auth_users', { email_to_check: email }),
    supabase.rpc('email_is_invited', { check_email: email }),
  ]);

  if (registeredResult.error || inAuthResult.error || invitedResult.error) {
    redirect({ href: '/profile?invite_error=unknown', locale });
  }
  if (registeredResult.data || inAuthResult.data) {
    redirect({ href: '/profile?invite_error=already_user', locale });
  }
  // An open invitation already exists for this address (from the admin door
  // or another friend-invite) — don't send a second invite-mail.
  if (invitedResult.data) {
    redirect({ href: '/profile?invite_error=already_invited', locale });
  }

  const inviterName = profile.name?.trim() || 'En venn';

  // Audit log. Token is required NOT NULL UNIQUE; we generate a uuid here
  // just to satisfy the column. The actual OTP code is sent by Supabase
  // when the invitee reaches /login and asks for one.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const inviteToken = randomUUID();
  const { error: insertError } = await supabase.from('invitations').insert({
    email,
    token: inviteToken,
    invited_by: user.id,
    game_id: null,
    expires_at: expiresAt,
  });

  if (insertError) {
    redirect({ href: '/profile?invite_error=unknown', locale });
  }

  // Send the "you've been invited" notification. The OTP code itself is
  // sent later by Supabase when the invitee reaches /login. Best-effort:
  // a mail failure doesn't roll back the invitation.
  try {
    await sendInviteNotification({
      to: email,
      invitedByName: inviterName,
      inviteToken,
    });
  } catch (err) {
    console.error('[invite] notification mail failed', err);
  }

  const returnTo = String(formData.get('return') ?? '').trim();
  if (returnTo === 'venner') {
    const qs = new URLSearchParams({ status: 'invited', invite_email: email });
    redirect({ href: `/profile/venner?${qs.toString()}`, locale });
  }
  const qs = new URLSearchParams({ invite: 'sent', invite_email: email });
  redirect({ href: `/profile?${qs.toString()}`, locale });
}
