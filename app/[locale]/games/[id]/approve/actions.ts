'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { canApproveScorecardFor } from '@/lib/games/flightScope';
import {
  approveScorecardCore,
  rejectScorecardCore,
} from '@/lib/games/reviewScorecardCore';
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
  const gameMode = game.game_mode as GameMode;

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
      gameMode,
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
    gameMode,
    user.id,
    playerUserId,
  );
  return {
    supabase,
    user,
    locale,
    gameMode,
    authz: { ok: canApprove, isAdmin } satisfies AuthorizationResult,
  };
}

/**
 * Approve a flight-mate's scorecard. Idempotent — if already approved this
 * is a no-op. Clears any prior rejection_reason so it can't linger.
 *
 * #2215: the write, the 0-row guard (#704), the `scorecard_approved` varsel
 * and the cache expiry live in `approveScorecardCore`, which the app route
 * `app/api/games/[id]/scorecards/[userId]` calls too. This wrapper keeps the
 * gate and the redirects.
 */
export async function approveScorecard(gameId: string, playerUserId: string) {
  const { supabase, user, locale, authz } = await loadAndAuthorize(
    gameId,
    playerUserId,
  );
  if (!authz.ok) redirect({ href: '/', locale });

  // #1598: this path is always a flight-mate — admin/organizer approve through
  // adminApproveScorecard — so the role is 'peer' even when an admin lands here
  // (loadAndAuthorize lets admins through). Deriving it from `authz.isAdmin`
  // would change what a nameless approver's card says.
  const result = await approveScorecardCore({
    client: supabase,
    gameId,
    approverUserId: user.id,
    playerUserId,
    approverRole: 'peer',
  });

  // `not_pending` and `db` share the existing `db` code («Klarte ikke å lagre
  // endringen») rather than a new i18n key.
  if (!result.ok) {
    redirect({ href: `/games/${gameId}/approve?error=db` as string, locale });
  }
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
 *
 * #2213: in the one-ball team formats the rejection reopens the whole active
 * team through the service role, since every card there reads the captain's
 * rows. Every other mode keeps the one-row RLS write.
 *
 * #2215: all of that lives in `rejectScorecardCore`, shared with the app route
 * `app/api/games/[id]/scorecards/[userId]`. This wrapper keeps the gate and the
 * redirects.
 */
export async function rejectScorecard(gameId: string, formData: FormData) {
  const locale = await getLocale();
  const playerUserId = String(formData.get('player_user_id') ?? '');
  if (!playerUserId) {
    redirect({ href: `/games/${gameId}/approve?error=bad_request` as string, locale });
  }

  const { supabase, user, authz, gameMode } = await loadAndAuthorize(
    gameId,
    playerUserId,
  );
  if (!authz.ok) redirect({ href: '/', locale });

  const result = await rejectScorecardCore({
    client: supabase,
    gameId,
    gameMode,
    rejecterUserId: user.id,
    playerUserId,
    rawReason: String(formData.get('reason') ?? ''),
  });

  // Same mapping as approveScorecard: both refusals share the `db` code.
  if (!result.ok) {
    redirect({ href: `/games/${gameId}/approve?error=db` as string, locale });
  }
  redirect({ href: `/games/${gameId}/approve?status=rejected` as string, locale });
}
