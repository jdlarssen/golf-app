import 'server-only';
import { redirect } from 'next/navigation';
import { isTrustedCreator } from './trustedCreators';
import type { getServerClient } from '@/lib/supabase/server';

type ServerSupabase = Awaited<ReturnType<typeof getServerClient>>;

export interface AdminRoleContext {
  userId: string;
  email: string | null;
  // Display name from `public.users.name`. Carried on the context so action
  // code that previously did its own `users` round-trip just to read the
  // admin's name (for audit-logging / mail-from-name) can pull it from here
  // without an extra query.
  name: string | null;
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
    .select('is_admin, email, name')
    .eq('id', user.id)
    .single();

  const email =
    (profile?.email as string | null | undefined) ?? user.email ?? null;

  return {
    userId: user.id,
    email,
    name: (profile?.name as string | null | undefined) ?? null,
    isAdmin: profile?.is_admin === true,
    isTrusted: isTrustedCreator(email),
  };
}

/**
 * Gate for admin-only routes. Authenticates the user, loads role context,
 * and redirects non-admins:
 *  - Trusted creators → `/admin` so they stay inside Sekretariatet (and
 *    can still reach the Baner-flyt that opens up in Fase 4 chunk 2).
 *  - Other authenticated users → `/`.
 *  - Unauthenticated → `/login` (raised inside loadRole).
 *
 * Returns the full `AdminRoleContext` so callers can read `userId` / `name`
 * without a second `users` round-trip.
 */
export async function requireAdmin(
  supabase: ServerSupabase,
): Promise<AdminRoleContext> {
  const ctx = await loadRole(supabase);
  if (!ctx.isAdmin) redirect(ctx.isTrusted ? '/admin' : '/');
  return ctx;
}

export async function requireAdminOrTrustedCreator(
  supabase: ServerSupabase,
): Promise<AdminRoleContext> {
  const ctx = await loadRole(supabase);
  if (!ctx.isAdmin && !ctx.isTrusted) redirect('/');
  return ctx;
}

/**
 * Gate for routes/actions a game's CREATOR — or an admin — may use, e.g. the
 * non-admin finish flow (#427, `/games/[id]/avslutt`). Admins pass straight
 * through. Otherwise the caller must own the game (`games.created_by` === them);
 * the request-scoped client reads it via the "games select own created" RLS
 * policy (migration 0071), so this works even for a non-playing creator.
 * Anyone else → `/`.
 *
 * Returns the full `AdminRoleContext`; callers branch redirects on `isAdmin`
 * (admin → `/admin/games/*`, creator → `/games/*`).
 */
export async function requireAdminOrCreator(
  supabase: ServerSupabase,
  gameId: string,
): Promise<AdminRoleContext> {
  const ctx = await loadRole(supabase);
  if (ctx.isAdmin) return ctx;
  const { data: game } = await supabase
    .from('games')
    .select('created_by')
    .eq('id', gameId)
    .maybeSingle();
  if (game?.created_by === ctx.userId) return ctx;
  redirect('/');
}
