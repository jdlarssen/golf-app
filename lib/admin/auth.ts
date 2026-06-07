import 'server-only';
import { redirect } from 'next/navigation';
import { isTrustedCreator } from './trustedCreators';
import { getAdminClient } from '@/lib/supabase/admin';
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
 * Auth-only role read for the universal Klubbhuset room (#392). Requires a
 * logged-in user (redirects to `/login` via `loadRole` if there is no session)
 * but does NOT redirect based on role — it returns the full `AdminRoleContext`
 * so the caller can branch its own content per role. `/admin` is now reachable
 * by every logged-in user (the layout gate is auth-only); each admin-only
 * sub-route still self-gates with `requireAdmin*`, so this never widens access
 * to admin data on its own.
 */
export async function getRoleContext(
  supabase: ServerSupabase,
): Promise<AdminRoleContext> {
  return loadRole(supabase);
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

/**
 * Gate for routes/actions a CLUB's owner/admin — or a global admin — may use,
 * e.g. creating a club-scoped league (#480, `/klubber/[id]/liga/ny`). Global
 * admins pass straight through. Otherwise the caller must hold the `owner` or
 * `admin` role in the club's `group_members`; the request-scoped client reads
 * their own membership row via the "group_members select member or admin" RLS
 * policy (0074). Anyone else → the club page (`/klubber/[clubId]`), which is
 * itself member-gated.
 *
 * Returns the full `AdminRoleContext` so callers can read `userId` without a
 * second round-trip.
 */
export async function requireAdminOrClubAdmin(
  supabase: ServerSupabase,
  clubId: string,
): Promise<AdminRoleContext> {
  const ctx = await loadRole(supabase);
  if (ctx.isAdmin) return ctx;
  const { data: membership } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', clubId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (membership?.role === 'owner' || membership?.role === 'admin') return ctx;
  redirect(`/klubber/${clubId}`);
}

/**
 * Gate for managing a single LEAGUE (#483). Resolves the league's club and
 * delegates:
 *  - `group_id` set → klubb-liga: the league's club owner/admin (or a global
 *    admin) may manage it (`requireAdminOrClubAdmin`).
 *  - `group_id` null → frittstående liga: global-admin-only (`requireAdmin`),
 *    unchanged from before.
 *
 * The `group_id` lookup uses the admin client so the authorization decision
 * does not depend on the caller's own RLS visibility. This gate is a UX guard
 * (redirect non-managers); the real security boundary is the RLS WRITE policies
 * on leagues/league_rounds/league_players (migration 0083), which evaluate each
 * row's actual parent-league club — so a manipulated `league_id`/`round_id`
 * mismatch is still rejected at the data layer.
 */
export async function requireAdminOrClubAdminOfLeague(
  supabase: ServerSupabase,
  leagueId: string,
): Promise<AdminRoleContext> {
  const { data } = await getAdminClient()
    .from('leagues')
    .select('group_id')
    .eq('id', leagueId)
    .maybeSingle();
  const groupId = (data?.group_id as string | null | undefined) ?? null;
  return groupId
    ? requireAdminOrClubAdmin(supabase, groupId)
    : requireAdmin(supabase);
}
