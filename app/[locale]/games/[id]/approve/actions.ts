'use server';

import { redirect } from 'next/navigation';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications/notify';

type AuthorizationResult = {
  ok: boolean;
  isAdmin: boolean;
};

/**
 * Returns the supabase client, the current user, and whether the user is
 * authorised to act on `playerUserId`'s scorecard in `gameId`. Authorisation
 * means same-flight OR admin. This is defence in depth on top of the RLS
 * `game_players self submit` policy (which allows a player to update their
 * own row only).
 */
async function loadAndAuthorize(gameId: string, playerUserId: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // Refuse to act on finished games.
  const { data: game } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single<{ status: 'draft' | 'scheduled' | 'active' | 'finished' }>();
  if (!game || game.status !== 'active') {
    redirect(`/games/${gameId}/approve?error=not_active`);
  }

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single<{ is_admin: boolean }>();
  const isAdmin = !!profile?.is_admin;

  if (isAdmin) {
    return {
      supabase,
      user,
      authz: { ok: true, isAdmin } satisfies AuthorizationResult,
    };
  }

  // Same flight as the target player?
  const { data: me } = await supabase
    .from('game_players')
    .select('flight_number')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle<{ flight_number: number }>();
  const { data: target } = await supabase
    .from('game_players')
    .select('flight_number')
    .eq('game_id', gameId)
    .eq('user_id', playerUserId)
    .maybeSingle<{ flight_number: number }>();

  const sameFlight =
    !!me && !!target && me.flight_number === target.flight_number;
  return {
    supabase,
    user,
    authz: { ok: sameFlight, isAdmin } satisfies AuthorizationResult,
  };
}

/**
 * Approve a flight-mate's scorecard. Idempotent — if already approved this
 * is a no-op. Clears any prior rejection_reason so it can't linger.
 */
export async function approveScorecard(gameId: string, playerUserId: string) {
  const { supabase, user, authz } = await loadAndAuthorize(
    gameId,
    playerUserId,
  );
  if (!authz.ok) redirect('/');

  const { error } = await supabase
    .from('game_players')
    .update({
      approved_at: new Date().toISOString(),
      approved_by_user_id: user.id,
      rejection_reason: null,
    })
    .eq('game_id', gameId)
    .eq('user_id', playerUserId)
    .not('submitted_at', 'is', null)
    .is('approved_at', null);

  if (error) {
    redirect(`/games/${gameId}/approve?error=db`);
  }

  // Best-effort in-app varsel til submitter om at scorekortet er godkjent.
  // Vi henter game.name + approver.name parallelt og catch-er feil — notify()
  // skal aldri blokkere parent-action (per Phase 1-implementasjonen feiler den
  // stille på DB-error, men nettverks-feil under fetch kan kaste).
  try {
    const [gameRes, approverRes] = await Promise.all([
      supabase
        .from('games')
        .select('name')
        .eq('id', gameId)
        .single<{ name: string }>(),
      supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .maybeSingle<{ name: string | null }>(),
    ]);
    const gameName = gameRes.data?.name ?? '(ukjent spill)';
    const approverName =
      approverRes.data?.name?.trim() || '(ukjent godkjenner)';
    await notify({
      userId: playerUserId,
      kind: 'scorecard_approved',
      payload: {
        game_id: gameId,
        game_name: gameName,
        approver_name: approverName,
      },
    });
  } catch (err) {
    console.error('[approveScorecard] scorecard_approved notify failed', err);
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/games/${gameId}/approve`);
  redirect(`/games/${gameId}/approve?status=approved`);
}

/**
 * Reject a flight-mate's scorecard. Clears submitted_at / approved_at and
 * stores the reason on game_players so the affected player sees it on the
 * game home page next time they open the app.
 */
export async function rejectScorecard(gameId: string, formData: FormData) {
  const playerUserId = String(formData.get('player_user_id') ?? '');
  const reasonRaw = String(formData.get('reason') ?? '').trim();
  if (!playerUserId) {
    redirect(`/games/${gameId}/approve?error=bad_request`);
  }
  const reason = reasonRaw.length > 0 ? reasonRaw.slice(0, 500) : 'Ingen grunn oppgitt';

  const { supabase, authz } = await loadAndAuthorize(gameId, playerUserId);
  if (!authz.ok) redirect('/');

  const { error } = await supabase
    .from('game_players')
    .update({
      submitted_at: null,
      approved_at: null,
      approved_by_user_id: null,
      rejection_reason: reason,
    })
    .eq('game_id', gameId)
    .eq('user_id', playerUserId);

  if (error) {
    redirect(`/games/${gameId}/approve?error=db`);
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/games/${gameId}/approve`);
  redirect(`/games/${gameId}/approve?status=rejected`);
}
