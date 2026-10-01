'use server';

import { redirect as redirectToRoot } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import {
  approveRegistrationCore,
  loadRegistrationDecision,
  rejectRegistrationCore,
  type DecisionResult,
  type LoadFailure,
} from '@/lib/games/registrationDecisionCore';

/**
 * Approve/reject server-actions for game-registration-requests (issue #199).
 *
 * The work lives in `lib/games/registrationDecisionCore.ts` (#2263), shared
 * with the inbox's «Godta» / «Avslå». These wrappers only turn its result into
 * the redirects this page has always used: `?status=` on success, `?error=`
 * on the signup page for every failure, `/admin/games?error=` when the request
 * or game is gone, and `/` for a non-admin (as `requireAdmin` did).
 */

type Locale = Awaited<ReturnType<typeof getLocale>>;

function redirectLoadFailure(
  failure: { reason: LoadFailure; gameId: string | null },
  locale: Locale,
): never {
  if (failure.reason === 'forbidden') redirectToRoot('/');
  if (failure.reason === 'game_locked' && failure.gameId) {
    redirect({ href: `/admin/games/${failure.gameId}/signups?error=game_locked`, locale });
  }
  redirect({ href: `/admin/games?error=${failure.reason}`, locale });
}

function redirectResult(result: DecisionResult, gameId: string, locale: Locale): never {
  const detailPath = `/admin/games/${gameId}/signups`;
  if (result.ok) redirect({ href: `${detailPath}?status=${result.outcome}`, locale });
  redirect({ href: `${detailPath}?error=${result.reason}`, locale });
}

/**
 * Approve a pending registration request. Cascades to team-children if the
 * approved row is a team captain. Inserts game_players rows for the approved
 * user(s) and fires registration_approved notifications.
 */
export async function approveRequest(requestId: string): Promise<void> {
  const locale = await getLocale();
  const loaded = await loadRegistrationDecision(await getServerClient(), requestId);
  if (!loaded.ok) redirectLoadFailure(loaded, locale);
  redirectResult(await approveRegistrationCore(loaded.ctx), loaded.ctx.game.id, locale);
}

/**
 * Reject a pending registration request with an optional reason. Cascades
 * to team-children if the rejected row is a team captain.
 */
export async function rejectRequest(
  requestId: string,
  formData: FormData,
): Promise<void> {
  const locale = await getLocale();
  const loaded = await loadRegistrationDecision(await getServerClient(), requestId);
  if (!loaded.ok) redirectLoadFailure(loaded, locale);
  const gameId = loaded.ctx.game.id;

  // Honeypot — a field hidden from real admins, filled only by bots. Silent
  // reject with the success redirect so a bot cannot probe the difference.
  const honeypot = String(formData.get('website') ?? '').trim();
  if (honeypot) {
    console.warn('[honeypot] silent reject', { route: 'rejectRequest' });
    redirect({ href: `/admin/games/${gameId}/signups?status=rejected`, locale });
  }

  const reason = String(formData.get('reason') ?? '');
  redirectResult(await rejectRegistrationCore(loaded.ctx, reason), gameId, locale);
}

/**
 * #2358: arrangøren utpeker ny kaptein blant dem som står på laget (eierens
 * svar 3 på #2358).
 *
 * En kaptein med lagkamerater som har takket ja kan ikke trekke seg før start;
 * kapteinsbindet må gis videre først. Kapteinen gjør det på lagsida, og
 * arrangøren kan gjøre det her. Flyttingen bor i `transfer_team_captaincy`
 * (0194), som autoriserer aktøren på nytt (lagets kaptein, spillets oppretter
 * eller admin). Porten her er `requireAdminOrCreator`, og aktøren er den ekte
 * kalleren — funksjonen kjører som tjenesterollen og kan ikke lese `auth.uid()`.
 */
export async function transferTeamCaptaincy(
  gameId: string,
  requestId: string,
): Promise<void> {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  const detailPath = `/admin/games/${gameId}/signups?tab=approved`;

  const { data, error } = await getAdminClient().rpc('transfer_team_captaincy', {
    p_game_id: gameId,
    p_actor_user_id: ctx.userId,
    p_new_captain_request_id: requestId,
  });
  const outcome = error ? null : (data as { outcome?: string } | null)?.outcome;
  if (error) {
    console.error('[transferTeamCaptaincy] rpc failed', { gameId, error });
  }

  if (outcome === 'ok') {
    expireGameCache(gameId);
    redirect({ href: `${detailPath}&status=captain_transferred`, locale });
  }
  const code =
    outcome === 'not_approved'
      ? 'transfer_not_approved'
      : outcome === 'game_locked'
        ? 'game_locked'
        : 'transfer_failed';
  if (code === 'transfer_failed' && !error) {
    console.error('[transferTeamCaptaincy] refused', { gameId, requestId, outcome });
  }
  redirect({ href: `${detailPath}&error=${code}`, locale });
}
