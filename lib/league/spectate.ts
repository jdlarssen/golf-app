'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';
import { expectAffected } from '@/lib/supabase/affectedRows';

// UUID v4 shape: 8-4-4-4-12 hex groups separated by hyphens.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Look up a league by its public `spectate_token` (#1024).
 *
 * Uses the admin client (service-role) to bypass RLS — the token in the URL
 * is the authz mechanism for the public embed route; no session is available
 * there. Mirrors `getGameBySpectateToken` (#938).
 *
 * Returns `{ id }` when found, or `null` when the token is invalid, not a
 * valid UUID shape, or points to a league where the embed is disabled (token
 * revoked). Callers should `notFound()` on null.
 */
export async function getLeagueBySpectateToken(
  token: string,
): Promise<{ id: string } | null> {
  // Cheap guard: reject obviously-wrong tokens before hitting the DB.
  if (!UUID_RE.test(token)) return null;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('leagues')
    .select('id')
    .eq('spectate_token', token)
    .maybeSingle();

  if (error) {
    console.error('[getLeagueBySpectateToken] lookup failed', error);
    return null;
  }
  return data;
}

/**
 * Toggle the public embed for a league (#1024).
 *
 * - `enabled: true` — sets `spectate_token` to a new UUID (only when it is
 *   currently NULL; does not rotate an already-active token, which would kill
 *   iframes already pasted into club sites). Returns the token.
 * - `enabled: false` — nullifies `spectate_token`. Old embeds die. Returns null.
 *
 * Gates on `requireAdminOrClubAdminOfLeague` (same guard as the other league
 * management actions); the authed update + `expectAffected` catches silent
 * 0-row writes on top of the RLS write policies.
 */
export async function setLeagueEmbed(
  leagueId: string,
  enabled: boolean,
): Promise<string | null> {
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfLeague(supabase, leagueId);

  if (enabled) {
    const { data: current } = await supabase
      .from('leagues')
      .select('spectate_token')
      .eq('id', leagueId)
      .maybeSingle();

    if (current?.spectate_token) {
      // Already enabled — return the existing token without rotating.
      return current.spectate_token;
    }

    const newToken = crypto.randomUUID();
    const rows = expectAffected(
      await supabase
        .from('leagues')
        .update({ spectate_token: newToken })
        .eq('id', leagueId)
        .select('spectate_token'),
      'setLeagueEmbed:enable',
    );

    revalidatePath(`/admin/liga/${leagueId}`);
    return rows[0].spectate_token;
  }

  expectAffected(
    await supabase
      .from('leagues')
      .update({ spectate_token: null })
      .eq('id', leagueId)
      .select('id'),
    'setLeagueEmbed:disable',
  );

  revalidatePath(`/admin/liga/${leagueId}`);
  return null;
}
