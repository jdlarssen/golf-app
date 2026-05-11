import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';

// Server-side admin guard. We explicitly check is_admin on the user's own
// public.users row, rather than relying on RLS — a non-admin would still see
// their own row, so RLS alone wouldn't redirect them away. We want a hard
// 'not allowed' for non-admins.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (error || !profile || !profile.is_admin) {
    redirect('/');
  }

  return <>{children}</>;
}
