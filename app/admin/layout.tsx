import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';

// Server-side admin guard. We explicitly check is_admin on the user's own
// public.users row, rather than relying on RLS — a non-admin would still see
// their own row, so RLS alone wouldn't redirect them away. We want a hard
// 'not allowed' for non-admins.
//
// User id is read from the request header set by proxy.ts (which already
// verified the session) — skipping a duplicate auth.getUser() round-trip
// before the layout can render. ~80 ms saved on every admin navigation.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }

  const supabase = await getServerClient();
  const { data: profile, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();

  if (error || !profile || !profile.is_admin) {
    redirect('/');
  }

  return <>{children}</>;
}
