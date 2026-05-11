'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';

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
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.is_admin) {
    redirect('/');
  }

  // Build the absolute URL for the magic-link callback. Derived from request
  // headers the same way as the login flow, so this works in preview and prod.
  const headerList = await headers();
  const host =
    headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '';
  const protocol = headerList.get('x-forwarded-proto') ?? 'https';
  const callback = new URL('/auth/callback', `${protocol}://${host}`);

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Admins explicitly invite new users — create the auth user if missing.
      shouldCreateUser: true,
      emailRedirectTo: callback.toString(),
    },
  });

  if (otpError) {
    const msg = otpError.message?.toLowerCase() ?? '';
    let code: 'rate_limited' | 'unknown' = 'unknown';
    if (msg.includes('rate') || msg.includes('too many')) {
      code = 'rate_limited';
    }
    // Temporary debug: surface the raw Supabase message so we can see what
    // actually failed. Remove once SMTP / invitation flow is stable.
    const qs = new URLSearchParams({
      error: code,
      raw: (otpError.message ?? '').slice(0, 300),
      status: String(otpError.status ?? ''),
    });
    redirect(`/admin/invitations?${qs.toString()}`);
  }

  // Audit log. Supabase's own magic-link token is the actual mechanism; we
  // generate a uuid here just to satisfy the unique-not-null token column.
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

  const qs = new URLSearchParams({ status: 'sent', email });
  redirect(`/admin/invitations?${qs.toString()}`);
}
