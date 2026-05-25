import 'server-only';
import { redirect } from 'next/navigation';
import { isTrustedCreator } from './trustedCreators';
import type { getServerClient } from '@/lib/supabase/server';

type ServerSupabase = Awaited<ReturnType<typeof getServerClient>>;

export interface AdminRoleContext {
  userId: string;
  email: string | null;
  isAdmin: boolean;
  isTrusted: boolean;
}

async function loadRole(supabase: ServerSupabase): Promise<AdminRoleContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin, email')
    .eq('id', user.id)
    .single();

  const email =
    (profile?.email as string | null | undefined) ?? user.email ?? null;

  return {
    userId: user.id,
    email,
    isAdmin: profile?.is_admin === true,
    isTrusted: isTrustedCreator(email),
  };
}

export async function requireAdmin(
  supabase: ServerSupabase,
): Promise<AdminRoleContext> {
  const ctx = await loadRole(supabase);
  if (!ctx.isAdmin) redirect('/');
  return ctx;
}

export async function requireAdminOrTrustedCreator(
  supabase: ServerSupabase,
): Promise<AdminRoleContext> {
  const ctx = await loadRole(supabase);
  if (!ctx.isAdmin && !ctx.isTrusted) redirect('/');
  return ctx;
}
