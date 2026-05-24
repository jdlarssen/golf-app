import 'server-only';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import type { NotificationKind } from './types';

export type MarkReadOpts = {
  userId: string;
  /** Hvis satt, kun varselet med denne id-en markeres (brukes fra /innboks-tap). */
  notificationId?: string;
  /** Hvis satt, kun varsler med denne kind markeres. */
  kind?: NotificationKind;
  /** Hvis satt, kun varsler hvor payload.game_id matcher. */
  entityId?: string;
};

/**
 * Markerer matching uleste varsler som lest for `userId`. Best-effort:
 * feiler stille på error, blokkerer aldri parent-page-render.
 *
 * Bruker getServerClient() (cookies-basert) framfor admin — update er
 * gated av RLS-policy notifications_update_own så vi får authz «gratis»
 * fra Postgres uten å måtte gjenta auth-sjekken her.
 *
 * Brukes både ved tap-i-innboks og fra server-side helper på målsider
 * (f.eks. /games/[id]/leaderboard markerer game_finished-varsler for det
 * spillet). Mail-deeplink-klikk havner også her, siden mailen lenker til
 * samme target-rute.
 */
export async function markNotificationsRead(opts: MarkReadOpts): Promise<void> {
  const supabase = await getServerClient();

  let q = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', opts.userId)
    .is('read_at', null);

  if (opts.notificationId) q = q.eq('id', opts.notificationId);
  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.entityId) q = q.eq('payload->>game_id', opts.entityId);

  const { error } = await q;
  if (error) {
    console.error('[notifications] markRead failed', error);
    return;
  }

  // Next.js 16 krever to-arg-form for revalidateTag.
  revalidateTag(`notifications-${opts.userId}`, 'max');
}
