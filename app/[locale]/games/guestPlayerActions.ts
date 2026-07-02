'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import {
  parseGuestProfile,
  createGuestPlayer,
  createGuestUser,
  guestTeeToUserGender,
  guestTeeToLevel,
  type GuestTee,
} from '@/lib/games/createGuestPlayer';

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
