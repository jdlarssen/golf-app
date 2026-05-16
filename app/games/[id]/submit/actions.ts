'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { sendScorecardSubmittedNotification } from '@/lib/mail/scorecardSubmittedNotification';
import { firstName } from '@/lib/firstName';

/**
 * Mark the current user's scorecard as submitted.
 *
 * Idempotent: the `.is('submitted_at', null)` guard means a second call
 * after the first has succeeded is a no-op (it simply matches zero rows).
 * Also refuses to mark when the game is no longer active.
 *
 * Side-effect: best-effort "Scorekort levert"-mail to every admin (except
 * the submitter themselves) so the godkjennings-flyten can start without
 * the admin polling the app.
 */
export async function submitScorecard(gameId: string) {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Refuse to submit if the game isn't active. Draft games shouldn't have
  // scores yet and finished games are read-only. `name` is fetched here so
  // we can use it as the mail subject + body without a re-fetch.
  const { data: game } = await supabase
    .from('games')
    .select('name, status')
    .eq('id', gameId)
    .single<{ name: string; status: 'draft' | 'scheduled' | 'active' | 'finished' }>();

  if (!game || game.status !== 'active') {
    redirect(`/games/${gameId}/submit?error=not_active`);
  }

  const { error } = await supabase
    .from('game_players')
    .update({
      submitted_at: new Date().toISOString(),
      // A previous rejection clears once the player re-submits.
      rejection_reason: null,
    })
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .is('submitted_at', null);

  if (error) {
    redirect(`/games/${gameId}/submit?error=db`);
  }

  // Best-effort admin notification. Two queries fire in parallel:
  //   1) the submitter's own name (for the mail body)
  //   2) every admin's email + name (recipients)
  // The submitter is filtered out of recipients so a player-admin who
  // submits their own scorecard doesn't mail themselves a notification.
  const [playerRes, adminsRes] = await Promise.all([
    supabase.from('users').select('name').eq('id', user.id).maybeSingle<{
      name: string | null;
    }>(),
    supabase
      .from('users')
      .select('id, email, name')
      .eq('is_admin', true)
      .not('email', 'is', null)
      .returns<{ id: string; email: string; name: string | null }[]>(),
  ]);

  const playerName = playerRes.data?.name?.trim() || '(ukjent spiller)';
  const admins = (adminsRes.data ?? []).filter((a) => a.id !== user.id);
  if (admins.length > 0) {
    const results = await Promise.allSettled(
      admins.map((a) =>
        sendScorecardSubmittedNotification({
          to: a.email,
          adminFirstName: firstName(a.name),
          playerName,
          gameName: game!.name,
          gameId,
        }),
      ),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[submitScorecard] admin notification mail failed', r.reason);
      }
    }
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/games/${gameId}`);
  redirect(`/games/${gameId}?status=submitted`);
}
