'use server';

import 'server-only';
import { revalidateTag } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { getServerClient } from '@/lib/supabase/server';
import { expectAffected } from '@/lib/supabase/affectedRows';

// UUID v4 shape: 8-4-4-4-12 hex groups separated by hyphens.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Look up a game by its public `spectate_token`.
 *
 * Uses the admin client (service-role) to bypass RLS — the spectate token
 * is the authz mechanism for the public route; no session is available on
 * the spectate page (#938).
 *
 * Returns `{ id }` when found, or `null` when the token is invalid, not a
 * valid UUID shape, or points to a game where live-follow is disabled (token
 * revoked). Callers should `notFound()` on null.
 *
 * `spectate_token` was added in migration 0121 and is not yet reflected in
 * the generated types — we use `any` casts until `npm run gen:types` is re-run
 * against production after the column is deployed. (#938)
 */
export async function getGameBySpectateToken(
  token: string,
): Promise<{ id: string } | null> {
  // Cheap guard: reject obviously-wrong tokens before hitting the DB.
  if (!UUID_RE.test(token)) return null;

  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from('games')
    .select('id')
    .eq('spectate_token', token)
    .maybeSingle();

  if (error) {
    console.error('[getGameBySpectateToken] lookup failed', error);
    return null;
  }
  return data as { id: string } | null;
}

/**
 * Toggle the live-follow feature for a game.
 *
 * - `enabled: true` — sets `spectate_token` to a new UUID (only when it is
 *   currently NULL; does not rotate an already-active token). Returns the token.
 * - `enabled: false` — nullifies `spectate_token`. Old links die.
 *   Returns null.
 *
 * Uses the authed server client so RLS enforces that only the creator/admin
 * can UPDATE the `games` row. Asserts affected rows via `expectAffected` to
 * catch silent 0-row writes (AGENTS.md trap #2).
 *
 * Invalidates the `game-${gameId}` cache tag so the toggle UI reflects the
 * new state on next render.
 *
 * `spectate_token` was added in migration 0121 and is not yet reflected in
 * the generated types — we use `any` casts until `npm run gen:types` is re-run
 * after the column is deployed. (#938)
 *
 * Refs #938
 */
export async function setLiveFollow(
  gameId: string,
  enabled: boolean,
): Promise<string | null> {
  const supabase = await getServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  if (enabled) {
    // Only set the token when it is currently NULL — don't rotate an
    // already-active token (would break already-shared live links).
    const { data: current } = await sb
      .from('games')
      .select('spectate_token')
      .eq('id', gameId)
      .maybeSingle() as { data: { spectate_token: string | null } | null };

    if (current?.spectate_token) {
      // Already enabled — return the existing token without rotating.
      return current.spectate_token;
    }

    const newToken = crypto.randomUUID();
    const rows = expectAffected(
      await sb
        .from('games')
        .update({ spectate_token: newToken })
        .eq('id', gameId)
        .select('spectate_token') as { data: unknown[] | null; error: { message: string } | null },
      'setLiveFollow:enable',
    );

    revalidateTag(`game-${gameId}`, 'max');
    const row = rows[0] as { spectate_token: string };
    return row.spectate_token;
  } else {
    expectAffected(
      await sb
        .from('games')
        .update({ spectate_token: null })
        .eq('id', gameId)
        .select('id') as { data: unknown[] | null; error: { message: string } | null },
      'setLiveFollow:disable',
    );

    revalidateTag(`game-${gameId}`, 'max');
    return null;
  }
}
