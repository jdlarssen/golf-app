'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { approveScorecardCore, rejectScorecardCore } from '@/lib/games/reviewScorecardCore';
import { markerReviewAccess } from '@/lib/league/markerReviewAccess';

// The marker's two answers on a simulator-league card (#2661): approve, or
// send it back with a reason. Thin wrappers like /games/[id]/approve: the gate
// is `markerReviewAccess` (the named marker, the league's organiser or a
// global admin), and the write, the notice and the cache live in the cores.
//
// The cores write with the service role: the marker is not in the game, so
// RLS gives them no row, and 0220 lets only the server approve in a simulator
// flight. The gate is therefore the whole check, run again on every post.
// The marker's approval also requires `marker_user_id` in the write.

const pagePath = (leagueId: string, gameId: string, playerUserId: string) =>
  `/liga/${leagueId}/godkjenn/${gameId}/${playerUserId}`;

async function gate(leagueId: string, gameId: string, playerUserId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect({ href: '/login', locale });

  const here = pagePath(leagueId, gameId, playerUserId);
  const review = await markerReviewAccess(user.id, gameId, playerUserId);
  if (!review.ok || review.flight.leagueId !== leagueId) {
    redirect({ href: `${here}?error=forbidden`, locale });
  }
  if (review.state !== 'pending') redirect({ href: `${here}?error=not_pending`, locale });
  return { locale, userId: user.id, review, here };
}

export async function approveAsMarker(leagueId: string, gameId: string, playerUserId: string) {
  const { locale, userId, review, here } = await gate(leagueId, gameId, playerUserId);
  const result = await approveScorecardCore({
    client: getAdminClient(),
    gameId,
    approverUserId: userId,
    playerUserId,
    approverRole: review.role === 'marker' ? 'peer' : 'organizer',
    // mayApproveAsMarker already refused the one who delivered the card.
    delivererMayApprove: false,
    markerUserId: review.role === 'marker' ? userId : undefined,
  });
  if (!result.ok) redirect({ href: `${here}?error=db`, locale });
  revalidatePath(`/liga/${leagueId}`);
  // The round counts once the whole flight is approved and finished; a card
  // left in the flight gets its own receipt, so the banner never overclaims.
  const { data: game } = await getAdminClient()
    .from('games')
    .select('status')
    .eq('id', gameId)
    .maybeSingle<{ status: string }>();
  const status = game?.status === 'finished' ? 'approved' : 'approved_waiting';
  redirect({ href: `${here}?status=${status}`, locale });
}

export async function rejectAsMarker(leagueId: string, gameId: string, formData: FormData) {
  const playerUserId = String(formData.get('player_user_id') ?? '');
  const { locale, userId, review, here } = await gate(leagueId, gameId, playerUserId);
  const result = await rejectScorecardCore({
    client: getAdminClient(),
    gameId,
    gameMode: review.game.gameMode,
    rejecterUserId: userId,
    playerUserId,
    rawReason: String(formData.get('reason') ?? ''),
  });
  if (!result.ok) redirect({ href: `${here}?error=db`, locale });
  revalidatePath(`/liga/${leagueId}`);
  redirect({ href: `${here}?status=rejected`, locale });
}
