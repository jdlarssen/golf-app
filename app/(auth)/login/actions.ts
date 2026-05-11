'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const nextRaw = String(formData.get('next') ?? '').trim();
  // Only allow same-origin relative paths as `next` to prevent open redirects.
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '';

  const supabase = await getServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const qs = new URLSearchParams({ error: 'invalid_credentials' });
    if (next) qs.set('next', next);
    redirect(`/login?${qs.toString()}`);
  }

  redirect(next || '/');
}
