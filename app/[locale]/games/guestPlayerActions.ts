'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { isDisposableEmailDomain } from '@/lib/auth/disposableEmail';
import {
  parseGuestProfile,
  createGuestPlayer,
  createGuestUser,
  guestTeeToUserGender,
  guestTeeToLevel,
  type GuestTee,
} from '@/lib/games/createGuestPlayer';
import {
  claimGuestEmail,
  normalizeClaimEmail,
} from '@/lib/games/claimGuestResult';
import { sendGuestClaimNotification } from '@/lib/mail/guestClaimNotification';
import { firstName } from '@/lib/firstName';

const BEST_BALL_MAX_PLAYERS = 8;

/**
 * «Legg til gjest» på roster-cockpitene (#1009): creator-flaten
 * `/games/[id]/spillere` og admin-flaten `/admin/games/[id]`. Skygge-brukeren
 * + roster-raden opprettes atomisk-eller-kompensert i `createGuestPlayer`
 * (service-role, kontrakt-beslutning 8) — invite-eligibility-guarden (0115)
 * står urørt for klient-side skriv.
 *
 * Ingen notify: gjesten har ingen innboks å se varselet i, og
 * plassholder-adressen skal aldri få mail.
 */
export async function addGuestToGame(
  gameId: string,
  formData: FormData,
): Promise<void> {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const detailPath = ctx.isAdmin
    ? `/admin/games/${gameId}`
    : `/games/${gameId}/spillere`;

  const { data: game } = await supabase
    .from('games')
    .select('id, status, game_mode')
    .eq('id', gameId)
    .single<{ id: string; status: string; game_mode: string }>();
  if (!game) {
    redirect({ href: `${detailPath}?error=not_found`, locale });
  }

  if (game!.status === 'active' || game!.status === 'finished') {
    redirect({ href: `${detailPath}?error=game_locked`, locale });
  }

  // Gjester teller som vanlige spillere mot format-capene (kontrakt-beslutning
  // 2) — speiler best-ball-gaten i addExistingPlayerToGame.
  if (game!.game_mode === 'best_ball') {
    const { count } = await supabase
      .from('game_players')
      .select('user_id', { count: 'exact', head: true })
      .eq('game_id', gameId);
    if ((count ?? 0) >= BEST_BALL_MAX_PLAYERS) {
      redirect({ href: `${detailPath}?error=game_full`, locale });
    }
  }

  const parsed = parseGuestProfile({
    name: formData.get('guest_name'),
    hcp: formData.get('guest_hcp'),
    tee: formData.get('guest_tee'),
  });
  if (!parsed.ok) {
    redirect({ href: `${detailPath}?error=${parsed.error}`, locale });
  }

  const created = await createGuestPlayer(
    gameId,
    (parsed as Extract<typeof parsed, { ok: true }>).profile,
  );
  if (!created.ok) {
    redirect({ href: `${detailPath}?error=${created.error}`, locale });
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect({ href: `${detailPath}?status=guest_added`, locale });
}

export type WizardGuestResult =
  | {
      ok: true;
      player: {
        id: string;
        name: string;
        nickname: null;
        hcp_index: number;
        pending: false;
        gender: 'mens' | 'ladies' | null;
        level: 'junior' | 'normal';
        isGuest: true;
      };
      tee: GuestTee;
    }
  | { ok: false; error: string };

/**
 * «Legg til gjest» i opprett-veiviserens spillersteg (#1009). Spillet finnes
 * ikke ennå, så kun skygge-brukeren opprettes her; roster-raden skrives ved
 * publish (createGameInternal ruter gjeste-rader via service-role).
 *
 * Authz = samme gate som veiviseren selv (#427: enhver innlogget bruker kan
 * opprette eget spill). Forlates veiviseren etter dette kallet står
 * skygge-brukeren igjen uten spill — synlig med «Gjest»-chip i
 * admin-spillerlista og slettbar der (kontrakt-beslutning 5: ingen egen
 * oppryddings-mekanikk i v1).
 */
export async function createGuestForWizard(
  formData: FormData,
): Promise<WizardGuestResult> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'not_logged_in' };

  const parsed = parseGuestProfile({
    name: formData.get('guest_name'),
    hcp: formData.get('guest_hcp'),
    tee: formData.get('guest_tee'),
  });
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const created = await createGuestUser(parsed.profile);
  if (!created.ok) return { ok: false, error: created.error };

  return {
    ok: true,
    player: {
      id: created.userId,
      name: parsed.profile.name,
      nickname: null,
      hcp_index: parsed.profile.hcpIndex,
      pending: false,
      gender: guestTeeToUserGender(parsed.profile.tee),
      level: guestTeeToLevel(parsed.profile.tee),
      isGuest: true,
    },
    tee: parsed.profile.tee,
  };
}

/**
 * «Send resultatet til gjesten» (#1009, kontrakt-beslutning 7): på et
 * AVSLUTTET spill flipper arrangøren skygge-brukerens e-post til gjestens
 * ekte adresse (claimGuestEmail — auth + public.users, kompensert), legger
 * en invitations-rad (best-effort, audit + venne-kobling ved innlogging) og
 * sender claim-mailen (best-effort — feiler den beholdes flippen, arrangøren
 * kan sende på nytt). Gjesten logger inn med vanlig OTP → verifyCode nuller
 * is_guest → kontoen med historikken er deres. Ingen rad-flytting.
 */
export async function sendGuestResult(
  gameId: string,
  formData: FormData,
): Promise<void> {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  // Claim-seksjonen bor på spillere-cockpiten for begge roller.
  const detailPath = `/games/${gameId}/spillere`;

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status')
    .eq('id', gameId)
    .single<{ id: string; name: string; status: string }>();
  if (!game) {
    redirect({ href: `${detailPath}?error=not_found`, locale });
  }
  if (game!.status !== 'finished') {
    redirect({ href: `${detailPath}?error=guest_claim_not_finished`, locale });
  }

  const guestUserId = String(formData.get('guest_user_id') ?? '').trim();
  const email = normalizeClaimEmail(formData.get('guest_email'));
  if (!guestUserId || !email) {
    redirect({ href: `${detailPath}?error=guest_claim_invalid_email`, locale });
  }

  // Samme disposable-guard som e-post-invitasjoner (#422): admin er unntatt
  // (kurator-modellen), vanlige arrangører blokkeres.
  if (!ctx.isAdmin && isDisposableEmailDomain(email!)) {
    redirect({ href: `${detailPath}?error=disposable_email`, locale });
  }

  const claimed = await claimGuestEmail({
    gameId,
    guestUserId,
    email: email!,
  });
  if (!claimed.ok) {
    redirect({ href: `${detailPath}?error=${claimed.error}`, locale });
  }
  const claim = claimed as Extract<typeof claimed, { ok: true }>;

  // Invitations-rad (best-effort): gir claim-en et spor i invitasjonslista og
  // lar verifyCode-reconciliation koble venne-forholdet ved første innlogging.
  // Duplikater/feil svelges — raden er ikke nødvendig for selve innloggingen
  // (auth-brukeren finnes, signInWithOtp sender kode uansett).
  try {
    const admin = getAdminClient();
    await admin.from('invitations').insert({
      email: email!,
      token: randomUUID(),
      invited_by: ctx.userId,
      game_id: gameId,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[sendGuestResult] invitations insert failed (best-effort)', err);
  }

  const invitedByName =
    ctx.name?.trim() || (ctx.isAdmin ? 'Admin' : 'En arrangør');
  try {
    await sendGuestClaimNotification({
      to: email!,
      guestFirstName: firstName(claim.guestName),
      invitedByName,
      gameName: game!.name,
    });
  } catch (err) {
    // E-post-flippen beholdes (kontrakt-beslutning 7): gjesten kan logge inn
    // likevel, og arrangøren kan sende mailen på nytt fra samme skjema.
    console.error('[sendGuestResult] claim mail failed (flip kept)', err);
    revalidateTag(`game-${gameId}`, 'max');
    redirect({
      href: `${detailPath}?error=guest_claim_mail_failed&email=${encodeURIComponent(email!)}`,
      locale,
    });
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect({
    href: `${detailPath}?status=guest_claim_sent&email=${encodeURIComponent(email!)}`,
    locale,
  });
}
