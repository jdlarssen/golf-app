'use server';

import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { sendInviteNotification } from '@/lib/mail/inviteNotification';

export async function sendInvitation(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email) {
    redirect('/admin/invitations?error=email_required');
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Defensive: re-check admin status here, in addition to the layout guard.
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('is_admin, name')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.is_admin) {
    redirect('/');
  }

  const invitedByName = profile.name?.trim() || 'Admin';

  // Audit log. Token is required NOT NULL UNIQUE; we generate a uuid here
  // just to satisfy the column. The actual OTP code is sent by Supabase
  // when the invitee reaches /login and asks for one.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from('invitations').insert({
    email,
    token: randomUUID(),
    invited_by: user.id,
    expires_at: expiresAt,
  });

  if (insertError) {
    redirect('/admin/invitations?error=log_failed');
  }

  // Send the "you've been invited" notification. The OTP code itself is
  // sent later by Supabase when the invitee reaches /login and asks for
  // one. The invitations row is already persisted, so a mail failure
  // doesn't roll it back — but we surface the failure honestly to the
  // admin instead of pretending it worked. Resend errors are typically
  // config issues (unverified domain, sandbox `from`-address) that need
  // operator action.
  try {
    await sendInviteNotification({ to: email, invitedByName });
  } catch (err) {
    console.error('[admin/invitations] notification mail failed', err);
    const failQs = new URLSearchParams({ error: 'mail_failed', email });
    redirect(`/admin/invitations?${failQs.toString()}`);
  }

  const qs = new URLSearchParams({ status: 'sent', email });
  redirect(`/admin/invitations?${qs.toString()}`);
}
