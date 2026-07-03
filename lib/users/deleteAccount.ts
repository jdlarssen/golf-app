import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Konto-sletting for #1012, delt mellom selv-slett (`/profile/slett-konto`) og
 * admin-slett (`/admin/spillere/[id]/slett`).
 *
 * `users.id` har FK → `auth.users(id) ON DELETE CASCADE` (0001), så en hard
 * `auth.admin.deleteUser(id)` kaskader inn i `public.users` — hvor NO ACTION-
 * FK-ene fra `game_players`/`scores`/`invitations`/`games.created_by`
 * blokkerer for alle som har spilt. Regelen her:
 *
 *   0 game_players-rader  → forsøk hard delete (full sletting, kaskade rydder
 *                           alt); feiler den på en rest-FK (f.eks. sendte
 *                           invitasjoner) → fall tilbake til anonymisering.
 *   ≥1 game_players-rad   → anonymiser direkte (spillhistorikk beholdes).
 *
 * Anonymisering = `anonymize_user()`-RPC (0131, atomisk scrub + cleanup i
 * public-skjemaet) etterfulgt av GoTrue soft delete
 * (`auth.admin.deleteUser(id, true)`) som obfuskerer e-posten irreversibelt,
 * nuller passord/tokens og trekker alle sesjoner — men beholder auth-raden så
 * FK-kaskaden aldri fyrer. Rekkefølgen RPC-før-auth er bevisst: feiler
 * auth-steget har brukeren fortsatt sesjon og kan prøve igjen
 * (`deleted_at`-shortcircuiten hopper da rett til auth-steget).
 */

export type DeleteBlockReason = 'admin_account' | 'active_engagements';

export type DeleteAccountResult =
  | { ok: true; mode: 'hard' | 'anonymized' }
  | { ok: false; reason: 'failed' };

/**
 * Blokk-sjekk, gjenbrukt av begge bekreftelses-sider og begge actions.
 * Blokkerer når kontoen er admin, deltar i aktive/kommende spill, eller
 * arrangerer noe som ikke er avsluttet (spill, cup, liga) — en anonymisert
 * arrangør ville etterlatt turneringen uten styring (auto-start-cron ville
 * f.eks. varslet en konto ingen kan logge inn på).
 */
export async function getDeleteBlockReason(
  userId: string,
): Promise<DeleteBlockReason | null> {
  const admin = getAdminClient();

  const { data: target } = await admin
    .from('users')
    .select('is_admin, deleted_at')
    .eq('id', userId)
    .maybeSingle();
  if (!target) return null; // finnes ikke → ingen blokk; delete-stien håndterer
  if (target.is_admin) return 'admin_account';
  if (target.deleted_at) return null; // allerede anonymisert → kun auth-retry igjen

  const [playing, created, cups, leagues] = await Promise.all([
    admin
      .from('game_players')
      .select('game_id, games!inner(status)')
      .eq('user_id', userId)
      .in('games.status', ['active', 'scheduled'])
      .limit(1),
    admin
      .from('games')
      .select('id')
      .eq('created_by', userId)
      .in('status', ['active', 'scheduled'])
      .limit(1),
    admin
      .from('tournaments')
      .select('id')
      .eq('created_by', userId)
      .neq('status', 'finished')
      .limit(1),
    admin
      .from('leagues')
      .select('id')
      .eq('created_by', userId)
      .neq('status', 'finished')
      .limit(1),
  ]);

  const hasActive =
    (playing.data?.length ?? 0) > 0 ||
    (created.data?.length ?? 0) > 0 ||
    (cups.data?.length ?? 0) > 0 ||
    (leagues.data?.length ?? 0) > 0;
  return hasActive ? 'active_engagements' : null;
}

/** Sletter (hard) eller anonymiserer kontoen. Caller har allerede kjørt
 *  `getDeleteBlockReason` og auth-/self-guards. */
export async function deleteOrAnonymizeUser(
  userId: string,
  logPrefix: string,
): Promise<DeleteAccountResult> {
  const admin = getAdminClient();

  const { data: target } = await admin
    .from('users')
    .select('deleted_at')
    .eq('id', userId)
    .maybeSingle();

  // Retry-shortcircuit: public-siden er alt anonymisert, kun auth-steget gjenstår.
  if (target?.deleted_at) {
    const { error } = await admin.auth.admin.deleteUser(userId, true);
    if (error) {
      console.error(`${logPrefix} auth soft delete retry failed`, { userId, error });
      return { ok: false, reason: 'failed' };
    }
    return { ok: true, mode: 'anonymized' };
  }

  const { count: gpCount } = await admin
    .from('game_players')
    .select('game_id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if ((gpCount ?? 0) === 0) {
    // Aldri spilt → full sletting. Kaskaden rydder public.users + CASCADE-barna.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (!error) return { ok: true, mode: 'hard' };
    // Rest-FK-er (sendte invitasjoner, opprettede avsluttede spill o.l.)
    // blokkerer hard delete → anonymiser i stedet. Samme sluttresultat for
    // brukeren: kontoen er borte.
    console.warn(`${logPrefix} hard delete blocked — falling back to anonymize`, {
      userId,
      error,
    });
  }

  const { error: rpcError } = await admin.rpc('anonymize_user', {
    p_user_id: userId,
  });
  if (rpcError) {
    console.error(`${logPrefix} anonymize_user failed`, { userId, rpcError });
    return { ok: false, reason: 'failed' };
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId, true);
  if (authError) {
    console.error(`${logPrefix} auth soft delete failed`, { userId, authError });
    return { ok: false, reason: 'failed' };
  }

  return { ok: true, mode: 'anonymized' };
}
