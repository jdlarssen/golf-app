'use server';

import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendInviteNotification } from '@/lib/mail/inviteNotification';

async function requireAdmin() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error } = await supabase
    .from('users')
    .select('is_admin, name, id')
    .eq('id', user.id)
    .single();
  if (error || !profile?.is_admin) redirect('/');
  return { supabase, profile };
}

export async function sendInvitation(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) redirect('/admin/spillere?error=email_required');

  const { supabase, profile } = await requireAdmin();
  const invitedByName = profile.name?.trim() || 'Admin';

  // Guard against duplicate pending invitations — invitations.email has no
  // UNIQUE constraint, so without this check admin can accidentally create
  // two pending rows for the same address.
  const { data: existing } = await supabase
    .from('invitations')
    .select('id')
    .eq('email', email)
    .is('accepted_at', null)
    .maybeSingle();
  if (existing) {
    const qs = new URLSearchParams({ error: 'already_invited', email });
    redirect(`/admin/spillere?${qs.toString()}`);
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from('invitations').insert({
    email,
    token: randomUUID(),
    invited_by: profile.id,
    expires_at: expiresAt,
  });
  if (insertError) redirect('/admin/spillere?error=log_failed');

  try {
    await sendInviteNotification({ to: email, invitedByName });
  } catch (err) {
    console.error('[admin/spillere] notification mail failed', err);
    const qs = new URLSearchParams({ error: 'mail_failed', email });
    redirect(`/admin/spillere?${qs.toString()}`);
  }

  const qs = new URLSearchParams({ status: 'sent', email });
  redirect(`/admin/spillere?${qs.toString()}`);
}

export async function resendInvitation(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/spillere?error=unknown');

  const { supabase, profile } = await requireAdmin();
  const invitedByName = profile.name?.trim() || 'Admin';

  const { data: inv, error } = await supabase
    .from('invitations')
    .select('email, accepted_at')
    .eq('id', id)
    .single();
  if (error || !inv) redirect('/admin/spillere?error=resend_failed');
  if (inv.accepted_at) redirect('/admin/spillere?error=resend_failed');

  try {
    await sendInviteNotification({ to: inv.email, invitedByName });
  } catch (err) {
    console.error('[admin/spillere] resend mail failed', err);
    const qs = new URLSearchParams({ error: 'mail_failed', email: inv.email });
    redirect(`/admin/spillere?${qs.toString()}`);
  }

  const qs = new URLSearchParams({ status: 'resent', email: inv.email });
  redirect(`/admin/spillere?${qs.toString()}`);
}

export async function withdrawInvitation(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) redirect('/admin/spillere?error=unknown');

  const { supabase } = await requireAdmin();

  const { data: inv, error: fetchError } = await supabase
    .from('invitations')
    .select('email, accepted_at')
    .eq('id', id)
    .single();
  if (fetchError || !inv) redirect('/admin/spillere?error=withdraw_failed');
  if (inv.accepted_at) redirect('/admin/spillere?error=withdraw_failed');

  // Delete the invitations row via the cookie client (RLS lets admin do it).
  const { error: delError } = await supabase
    .from('invitations')
    .delete()
    .eq('id', id);
  if (delError) {
    console.error('[admin/spillere] invitation delete failed', delError);
    redirect('/admin/spillere?error=withdraw_failed');
  }

  // If the invitee had requested a code (auth.users row exists) but never
  // completed their profile (public.users.profile_completed_at IS NULL —
  // the row itself is now auto-created via trigger in migration 0014, so
  // its absence is no longer the right signal), clean up the auth.users
  // row via service-role so the email becomes free again. Cascade from
  // auth.users → public.users handles the placeholder row.
  try {
    const admin = getAdminClient();
    const { data: authList } = await admin.auth.admin.listUsers();
    const orphan = authList?.users?.find(
      (u) => u.email?.toLowerCase() === inv.email.toLowerCase(),
    );
    if (orphan) {
      const { data: publicRow } = await admin
        .from('users')
        .select('profile_completed_at')
        .eq('id', orphan.id)
        .maybeSingle();
      const profileIncomplete =
        !publicRow || publicRow.profile_completed_at == null;
      if (profileIncomplete) {
        await admin.auth.admin.deleteUser(orphan.id);
      }
    }
  } catch (err) {
    // Non-fatal — the invitations row has already been deleted. Log and let
    // the user see a success banner since the primary action succeeded.
    console.error('[admin/spillere] auth orphan cleanup failed', err);
  }

  const qs = new URLSearchParams({ status: 'withdrawn', email: inv.email });
  redirect(`/admin/spillere?${qs.toString()}`);
}
