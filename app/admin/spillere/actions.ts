'use server';

import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/admin/auth';
import { sendInviteNotification } from '@/lib/mail/inviteNotification';
import {
  consumeAdminInviteRateLimit,
  getClientIp,
} from '@/lib/admin/rateLimit';

/**
 * Self-gate + load `{ supabase, profile }` for the spillere-actions. Wraps
 * the shared `requireAdmin` helper so each action below can keep its
 * existing destructure-pattern (`{ supabase, profile }`) while routing
 * through the Fase-4-shared gate (#223 chunk 2 will lift the layout-gate).
 *
 * `profile.id` here matches `role.userId` and is used as the FK target for
 * invitations.invited_by and the rate-limit bucket key. `profile.name` is
 * inlined into the invite-notification mail so the recipient sees who from
 * Tørny actually invited them.
 */
async function loadAdminContext() {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);
  return {
    supabase,
    profile: { id: role.userId, name: role.name },
  };
}

export async function sendInvitation(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  // Honeypot — the `website` field is hidden in the form so a real admin
  // never types into it. A bot that POSTs to this server-action (somehow
  // bypassing the auth-gate, e.g. via a leaked session) will likely fill
  // every input. We pretend the invitation was sent without writing to
  // `invitations` or calling Resend. Logged to Vercel for awareness.
  const honeypot = String(formData.get('website') ?? '').trim();
  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'invite' });
    const qs = new URLSearchParams({ status: 'sent', email });
    redirect(`/admin/spillere?${qs.toString()}`);
  }

  if (!email) redirect('/admin/spillere?error=email_required');

  const { supabase, profile } = await loadAdminContext();
  const invitedByName = profile.name?.trim() || 'Admin';

  const ip = await getClientIp();
  const allowed = await consumeAdminInviteRateLimit({
    supabase,
    adminId: profile.id,
    ip,
  });
  if (!allowed) {
    const qs = new URLSearchParams({ error: 'rate_limited', email });
    redirect(`/admin/spillere?${qs.toString()}`);
  }

  // Shared cross-door dedup (#348): email_is_invited is the SECURITY DEFINER
  // RPC the friend door (app/invite/actions.ts) and the login flow also use,
  // so all three agree on what "already invited" means (open = not-accepted
  // AND not-expired). Stops a second invite-mail when a friend-invite already
  // exists, without needing a UNIQUE constraint on invitations.email. An
  // expired invitation no longer blocks a fresh one — admin uses «Send på
  // nytt» to revive a still-valid pending invitation.
  const { data: alreadyInvited } = await supabase.rpc('email_is_invited', {
    check_email: email,
  });
  if (alreadyInvited) {
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

  const { supabase, profile } = await loadAdminContext();
  const invitedByName = profile.name?.trim() || 'Admin';

  const ip = await getClientIp();
  const allowed = await consumeAdminInviteRateLimit({
    supabase,
    adminId: profile.id,
    ip,
  });
  if (!allowed) {
    redirect('/admin/spillere?error=rate_limited');
  }

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

  const { supabase } = await loadAdminContext();

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
