'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications/notify';
import { peersForApproval } from '@/lib/games/flightScope';
import type { GameMode } from '@/lib/scoring/modes/types';

type AuthorizationResult = {
  ok: boolean;
  isAdmin: boolean;
};

/**
 * Returns the supabase client, the current user, and whether the user is
 * authorised to act on `playerUserId`'s scorecard in `gameId`. Authorisation
 * means same-flight OR admin OR single-flight game (#543). This is defence in
 * depth on top of the RLS `game_players self submit` policy (which allows a
 * player to update their own row only).
 */
async function loadAndAuthorize(gameId: string, playerUserId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user: maybeUser },
  } = await supabase.auth.getUser();
  if (!maybeUser) {
    redirect({ href: '/login', locale });
  }
  const user = maybeUser!;

  // Refuse to act on finished games.
  const { data: maybeGame } = await supabase
    .from('games')
    .select('status, game_mode')
    .eq('id', gameId)
    .single<{ status: 'draft' | 'scheduled' | 'active' | 'finished'; game_mode: string }>();
  if (!maybeGame || maybeGame.status !== 'active') {
    redirect({ href: `/games/${gameId}/approve?error=not_active` as string, locale });
  }
  const game = maybeGame!;

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
      locale,
      authz: { ok: true, isAdmin } satisfies AuthorizationResult,
    };
  }

  // #543: bruk peersForApproval — tillat når spillet er én-flight (≤4 aktive
  // spillere eller wolf) ELLER spillerne er i samme tildelte flight.
  const { data: allPlayers } = await supabase
    .from('game_players')
    .select('user_id, flight_number, withdrawn_at')
    .eq('game_id', gameId)
    .returns<
      { user_id: string; flight_number: number | null; withdrawn_at: string | null }[]
    >();

  const peers = peersForApproval(
    allPlayers ?? [],
    game.game_mode as GameMode,
    user.id,
  );
  const canApprove = peers.includes(playerUserId);
  return {
    supabase,
    user,
    locale,
    authz: { ok: canApprove, isAdmin } satisfies AuthorizationResult,
  };
}

/**
 * Approve a flight-mate's scorecard. Idempotent — if already approved this
 * is a no-op. Clears any prior rejection_reason so it can't linger.
 */
export async function approveScorecard(gameId: string, playerUserId: string) {
  const { supabase, user, locale, authz } = await loadAndAuthorize(
    gameId,
    playerUserId,
  );
  if (!authz.ok) redirect({ href: '/', locale });

  const { data: updated, error } = await supabase
    .from('game_players')
    .update({
      approved_at: new Date().toISOString(),
      approved_by_user_id: user.id,
      rejection_reason: null,
    })
    .eq('game_id', gameId)
    .eq('user_id', playerUserId)
    .not('submitted_at', 'is', null)
    .is('approved_at', null)
    .select('user_id');

  if (error) {
    redirect({ href: `/games/${gameId}/approve?error=db` as string, locale });
  }

  // #704: en 0-rads-UPDATE returnerer error == null (Supabase-quirk), så uten
  // denne vakta ville en RLS-blokkert peer-godkjenning rapportere falsk suksess
  // og sende varsel mens approved_at aldri ble skrevet. Skiller to 0-rads-grunner:
  //   • allerede godkjent → idempotent no-op (rediger til suksess, IKKE nytt varsel)
  //   • RLS/rad-tilgang nektet → ekte feil (?error=db, ingen varsel)
  if (!updated || updated.length === 0) {
    const { data: existing } = await supabase
      .from('game_players')
      .select('approved_at')
      .eq('game_id', gameId)
      .eq('user_id', playerUserId)
      .maybeSingle<{ approved_at: string | null }>();

    if (existing?.approved_at) {
      // Allerede godkjent — idempotent. Ikke send varsel på nytt.
      revalidateTag(`game-${gameId}`, 'max');
      revalidatePath(`/games/${gameId}`);
      revalidatePath(`/games/${gameId}/approve`);
      redirect({ href: `/games/${gameId}/approve?status=approved` as string, locale });
    }
    // Skrivingen traff ingen rad og kortet er fortsatt ikke godkjent →
    // tilgang nektet (eller ikke-levert kort). Ikke rapporter suksess. Bruker
    // den eksisterende `db`-feilkoden («Klarte ikke å lagre endringen») i stedet
    // for å introdusere en ny i18n-nøkkel.
    redirect({ href: `/games/${gameId}/approve?error=db` as string, locale });
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
  redirect({ href: `/games/${gameId}/approve?status=approved` as string, locale });
}

/**
 * Reject a flight-mate's scorecard. Clears submitted_at / approved_at and
 * stores the reason on game_players so the affected player sees it on the
 * game home page next time they open the app.
 */
export async function rejectScorecard(gameId: string, formData: FormData) {
  const locale = await getLocale();
  const playerUserId = String(formData.get('player_user_id') ?? '');
  const reasonRaw = String(formData.get('reason') ?? '').trim();
  if (!playerUserId) {
    redirect({ href: `/games/${gameId}/approve?error=bad_request` as string, locale });
  }
  const reason = reasonRaw.length > 0 ? reasonRaw.slice(0, 500) : 'Ingen grunn oppgitt';

  const { supabase, authz } = await loadAndAuthorize(gameId, playerUserId);
  if (!authz.ok) redirect({ href: '/', locale });

  const { data: updated, error } = await supabase
    .from('game_players')
    .update({
      submitted_at: null,
      approved_at: null,
      approved_by_user_id: null,
      rejection_reason: reason,
    })
    .eq('game_id', gameId)
    .eq('user_id', playerUserId)
    .select('user_id');

  if (error) {
    redirect({ href: `/games/${gameId}/approve?error=db` as string, locale });
  }

  // #704: samme 0-rads-felle som approveScorecard. Uten denne vakta ville en
  // RLS-blokkert peer-avvisning rapportere falsk suksess (redirect ?status=
  // rejected) mens raden aldri ble rørt. Reject har ingen idempotens-filter, så
  // en 0-rads-UPDATE betyr utvetydig nektet tilgang (eller manglende rad). Bruker
  // den eksisterende `db`-feilkoden i stedet for en ny i18n-nøkkel.
  if (!updated || updated.length === 0) {
    redirect({ href: `/games/${gameId}/approve?error=db` as string, locale });
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/games/${gameId}/approve`);
  redirect({ href: `/games/${gameId}/approve?status=rejected` as string, locale });
}
