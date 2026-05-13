'use server';

import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { getQuotaState } from '@/lib/invitations/quota';
import { sendInviteNotification } from '@/lib/mail/inviteNotification';

// Lightweight format check. We rely on browser `type="email"` + the
// fact that Supabase will reject malformed addresses too. Just guard
// against trivially-empty / no-@ submissions here.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sendFriendInvite(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email) {
    redirect('/profile?invite_error=email_required');
  }
  if (!looksLikeEmail(email)) {
    redirect('/profile?invite_error=invalid_email');
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Look up inviter profile. If the inviter hasn't completed their own
  // profile, send them there first — same defensive pattern as /profile.
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single();

  if (profileError && profileError.code === 'PGRST116') {
    redirect('/complete-profile');
  }
  if (profileError || !profile) {
    redirect('/profile?invite_error=unknown');
  }

  // Defensive quota re-check — the /invite page already gates on this,
  // but server-side enforcement is what actually protects the rule.
  const quota = await getQuotaState(supabase, user.id);
  if (quota.isExhausted) {
    redirect('/profile?invite_error=quota');
  }

  // Block invites to addresses that already have a Tørny account.
  // Prevents confusing "X has invited you" mails to existing users. The
  // SECURITY DEFINER RPC bypasses RLS so we get a truthful answer
  // regardless of whether the inviter shares a game with the invitee.
  const { data: isRegistered, error: existingError } = await supabase.rpc(
    'email_is_registered',
    { p_email: email },
  );

  if (existingError) {
    redirect('/profile?invite_error=unknown');
  }
  if (isRegistered) {
    redirect('/profile?invite_error=already_user');
  }

  const inviterName = profile.name?.trim() || 'En venn';

  // Audit log. Token is required NOT NULL UNIQUE; we generate a uuid here
  // just to satisfy the column. The actual OTP code is sent by Supabase
  // when the invitee reaches /login and asks for one.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from('invitations').insert({
    email,
    token: randomUUID(),
    invited_by: user.id,
    game_id: null,
    expires_at: expiresAt,
  });

  if (insertError) {
    redirect('/profile?invite_error=unknown');
  }

  // Send the "you've been invited" notification. The OTP code itself is
  // sent later by Supabase when the invitee reaches /login. Best-effort:
  // a mail failure doesn't roll back the invitation.
  try {
    await sendInviteNotification({ to: email, invitedByName: inviterName });
  } catch (err) {
    console.error('[invite] notification mail failed', err);
  }

  const qs = new URLSearchParams({ invite: 'sent', invite_email: email });
  redirect(`/profile?${qs.toString()}`);
}
