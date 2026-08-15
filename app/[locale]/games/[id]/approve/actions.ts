'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notifications/notify';
import { canApproveScorecardFor } from '@/lib/games/flightScope';
import { NO_REJECTION_REASON } from '@/lib/games/rejectionReason';
import type { GameMode } from '@/lib/scoring/modes/types';

type AuthorizationResult = {
  ok: boolean;
  isAdmin: boolean;
};

/**
 * Returns the supabase client, the current user, and whether the user is
 * authorised to act on `playerUserId`'s scorecard in `gameId`. Authorisation
 * means admin, or `canApproveScorecardFor` — the shared attestation rule
 * (#543/#1359), which the /approve page renders from too, so the page and the
 * action can never disagree. Defence in depth on top of the RLS policies.
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

  // #543: attestant-regelen — tillat når spillet er én-flight (≤4 aktive
  // spillere eller wolf) ELLER spillerne er i samme tildelte flight.
  const { data: allPlayers } = await supabase
    .from('game_players')
    .select('user_id, flight_number, withdrawn_at')
    .eq('game_id', gameId)
    .returns<
      { user_id: string; flight_number: number | null; withdrawn_at: string | null }[]
    >();

  const canApprove = canApproveScorecardFor(
    allPlayers ?? [],
    game.game_mode as GameMode,
    user.id,
    playerUserId,
  );
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
    // #1364: null i stedet for norsk plassholdertekst. Payloaden skrives i
    // godkjennerens kontekst men leses i mottakerens locale, så kortet fyller
    // fallbacken ved render (buildNotificationText).
    await notify({
      userId: playerUserId,
      kind: 'scorecard_approved',
      payload: {
        game_id: gameId,
        game_name: gameRes.data?.name ?? null,
        approver_name: approverRes.data?.name?.trim() || null,
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
 * stores the reason on game_players so the game home page can show it. Fires a
 * best-effort `scorecard_rejected` notification (in-app + push when the player
 * is off-app) so the player learns the round has stalled without having to
 * reopen the game — the /approve banner promises exactly this (#1358).
 *
 * Idempotent since #1395 — a second reject of the same card is a no-op that
 * still lands on the success banner, but sends no second notification.
 *
 * Admin rejection runs through this same action (loadAndAuthorize lets admins
 * straight through), so peer and admin rejection are covered by one call site.
 */
export async function rejectScorecard(gameId: string, formData: FormData) {
  const locale = await getLocale();
  const playerUserId = String(formData.get('player_user_id') ?? '');
  const reasonRaw = String(formData.get('reason') ?? '').trim();
  if (!playerUserId) {
    redirect({ href: `/games/${gameId}/approve?error=bad_request` as string, locale });
  }
  // #1364: uten begrunnelse lagres en maskinsentinel, ikke norsk prosa — raden
  // leses av spillere i begge locales, og banneret på spill-hjem er gated på at
  // feltet er truthy (se NO_REJECTION_REASON for hvorfor null ikke går).
  const reason =
    reasonRaw.length > 0 ? reasonRaw.slice(0, 500) : NO_REJECTION_REASON;

  const { supabase, user, authz } = await loadAndAuthorize(gameId, playerUserId);
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
    // #1395: kun et innlevert kort kan avvises. Uten filteret traff et
    // dobbelttrykk (eller en re-post av skjemaet) fortsatt 1 rad og fyrte et
    // nytt scorecard_rejected-varsel + push til spilleren.
    .not('submitted_at', 'is', null)
    .select('user_id');

  if (error) {
    redirect({ href: `/games/${gameId}/approve?error=db` as string, locale });
  }

  // #704: samme 0-rads-felle som approveScorecard. Uten denne vakta ville en
  // RLS-blokkert peer-avvisning rapportere falsk suksess (redirect ?status=
  // rejected) mens raden aldri ble rørt. Bruker den eksisterende `db`-feilkoden
  // i stedet for en ny i18n-nøkkel.
  //
  // #1395: med submitted_at-filteret har 0 rader to lovlige grunner, akkurat som
  // i approveScorecard. Ett oppfølgings-SELECT skiller dem — attestanten kan
  // lese raden («game_players select shared game»: is_admin() OR
  // is_in_game(game_id), pluss «game_players creator select» for arrangøren som
  // ikke spiller selv):
  //   • raden synlig med submitted_at = null → kortet er allerede avvist (eller
  //     aldri levert) → idempotent suksess, og INGEN nytt varsel.
  //   • raden usynlig/borte → tilgang nektet → ?error=db som før.
  if (!updated || updated.length === 0) {
    const { data: existing } = await supabase
      .from('game_players')
      .select('submitted_at')
      .eq('game_id', gameId)
      .eq('user_id', playerUserId)
      .maybeSingle<{ submitted_at: string | null }>();

    if (existing && existing.submitted_at === null) {
      // Allerede avvist — idempotent. Revalider så et stakkars «venter på
      // godkjenning»-UI ikke blir hengende, men ikke varsle på nytt.
      revalidateTag(`game-${gameId}`, 'max');
      revalidatePath(`/games/${gameId}`);
      revalidatePath(`/games/${gameId}/approve`);
      redirect({ href: `/games/${gameId}/approve?status=rejected` as string, locale });
    }
    redirect({ href: `/games/${gameId}/approve?error=db` as string, locale });
  }

  // #1358: best-effort in-app varsel til spilleren om at kortet ble avvist.
  // Speiler approveScorecard: notify() skal ALDRI blokkere selve avvisningen —
  // raden er allerede skrevet her, og /approve-banneret lover at spilleren
  // varsles. Plasseringen etter 0-rads-guarden er kritisk (I3): en RLS-blokkert
  // avvisning (0 rader, error == null — #704-fella) må ikke varsle om en
  // skriving som aldri skjedde. redirect() står UTENFOR try-en — den kaster
  // NEXT_REDIRECT og må ikke svelges av catch-en.
  //
  // DEPLOY-REKKEFØLGE: migrasjon 0149 må være påført før dette kjører i prod.
  // Uten den avviser notifications_kind_check inserten og notify() svelger
  // feilen (console.error '[notifications] insert failed') — grønt UI, ingen
  // varsel. Verifiser med en SELECT mot notifications etter staging-runden.
  try {
    const [gameRes, rejecterRes] = await Promise.all([
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
    await notify({
      userId: playerUserId,
      kind: 'scorecard_rejected',
      payload: {
        game_id: gameId,
        game_name: gameRes.data?.name ?? null,
        rejecter_name: rejecterRes.data?.name?.trim() || null,
        // Utelat feltet helt når attestanten ikke skrev noe, så kortet kan vise
        // en lokalisert defaultReason. DB-raden bærer sentinelen i stedet —
        // den styrer spill-hjem-banneret, som oversetter på samme måte.
        ...(reasonRaw.length > 0 ? { reason } : {}),
      },
    });
  } catch (err) {
    console.error('[rejectScorecard] scorecard_rejected notify failed', err);
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/games/${gameId}/approve`);
  redirect({ href: `/games/${gameId}/approve?status=rejected` as string, locale });
}
