'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { getQuotaState } from '@/lib/invitations/quota';

// Lightweight format check. We rely on browser `type="email"` + the
// fact that Supabase will reject malformed addresses too. Just guard
// against trivially-empty / no-@ submissions here.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function sendFriendInvite(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email) {
    redirect('/invite?error=email_required');
  }
  if (!looksLikeEmail(email)) {
    redirect('/invite?error=invalid_email');
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
    redirect('/invite?error=unknown');
  }

  // Defensive quota re-check — the /invite page already gates on this,
  // but server-side enforcement is what actually protects the rule.
  const quota = await getQuotaState(supabase, user.id);
  if (quota.isExhausted) {
    redirect('/invite?error=quota');
  }

  // Block invites to addresses that already have a Tørny account.
  // Prevents user_metadata.inviter_name pollution and confusing
  // "X has invited you" mails to existing users. The SECURITY DEFINER
  // RPC bypasses RLS so we get a truthful answer regardless of whether
  // the inviter shares a game with the invitee.
  const { data: isRegistered, error: existingError } = await supabase.rpc(
    'email_is_registered',
    { p_email: email },
  );

  if (existingError) {
    redirect('/invite?error=unknown');
  }
  if (isRegistered) {
    redirect('/invite?error=already_user');
  }

  // Compute callback URL from request headers — same approach as
  // /login and /admin/invitations so we don't hardcode the host.
  const headerList = await headers();
  const host =
    headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '';
  const protocol = headerList.get('x-forwarded-proto') ?? 'https';
  const callback = new URL('/auth/callback', `${protocol}://${host}`);

  const inviterName = profile.name?.trim() || 'En venn';

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: callback.toString(),
      data: { inviter_name: inviterName },
    },
  });

  if (otpError) {
    const msg = otpError.message?.toLowerCase() ?? '';
    const code = msg.includes('rate') || msg.includes('too many')
      ? 'rate_limited'
      : 'unknown';
    redirect(`/invite?error=${code}`);
  }

  // Audit log. Token is required NOT NULL UNIQUE but Supabase's own
  // magic-link token is the real mechanism; this UUID exists only to
  // satisfy the column.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from('invitations').insert({
    email,
    token: randomUUID(),
    invited_by: user.id,
    game_id: null,
    expires_at: expiresAt,
  });

  if (insertError) {
    // Mail already went out via signInWithOtp; logging failure isn't
    // fatal but we surface it so the user knows something odd happened.
    redirect('/invite?error=unknown');
  }

  const qs = new URLSearchParams({ status: 'sent', email });
  redirect(`/invite?${qs.toString()}`);
}
