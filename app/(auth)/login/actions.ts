'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getServerClient } from '@/lib/supabase/server';

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const nextRaw = String(formData.get('next') ?? '').trim();
  // Only allow same-origin relative paths as `next` to prevent open redirects.
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '';

  if (!email) {
    redirect('/login?error=unknown');
  }

  // Compute the absolute URL to our callback, including the 'next' param.
  const headerList = await headers();
  const host =
    headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '';
  const protocol = headerList.get('x-forwarded-proto') ?? 'https';
  const callback = new URL('/auth/callback', `${protocol}://${host}`);
  if (next) callback.searchParams.set('next', next);

  const supabase = await getServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Existing users only; admins invite new ones via a separate flow.
      shouldCreateUser: false,
      emailRedirectTo: callback.toString(),
    },
  });

  if (error) {
    // Map a few common Supabase error messages to stable codes.
    const msg = error.message?.toLowerCase() ?? '';
    let code: 'rate_limited' | 'user_not_found' | 'unknown' = 'unknown';
    if (msg.includes('rate') || msg.includes('too many')) {
      code = 'rate_limited';
    } else if (
      msg.includes('not found') ||
      msg.includes('signups not allowed') ||
      msg.includes('signups are disabled')
    ) {
      code = 'user_not_found';
    }
    redirect(`/login?error=${code}`);
  }

  const qs = new URLSearchParams({ status: 'sent', email });
  if (next) qs.set('next', next);
  redirect(`/login?${qs.toString()}`);
}
