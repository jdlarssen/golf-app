'use server';

import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import {
  calculateCourseHandicap,
  applyAllowance,
} from '@/lib/scoring/courseHandicap';

async function requireAdmin() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) redirect('/');

  return { supabase, user };
}

export async function startGame(gameId: string) {
  const { supabase } = await requireAdmin();
  const detailPath = `/admin/games/${gameId}`;

  // Load the game (status + allowance + tee id) so we can compute frozen
  // handicaps. Refuse to start anything that isn't currently a draft.
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, status, hcp_allowance_pct, tee_box_id')
    .eq('id', gameId)
    .single();
  if (gameError || !game) redirect(`${detailPath}?error=not_found`);
  if (game!.status !== 'draft') redirect(`${detailPath}?error=not_draft`);

  const { data: tee, error: teeError } = await supabase
    .from('tee_boxes')
    .select('slope, course_rating, par_total')
    .eq('id', game!.tee_box_id)
    .single();
  if (teeError || !tee) redirect(`${detailPath}?error=db_tee`);

  const { data: gamePlayers, error: gpError } = await supabase
    .from('game_players')
    .select('user_id, users(hcp_index)')
    .eq('game_id', gameId)
    .returns<{ user_id: string; users: { hcp_index: number | string } | null }[]>();
  if (gpError || !gamePlayers) redirect(`${detailPath}?error=db_players`);

  // Freeze a course handicap per player using the configured allowance.
  for (const row of gamePlayers!) {
    if (!row.users) continue;
    const raw = calculateCourseHandicap({
      hcpIndex: Number(row.users.hcp_index),
      slope: tee!.slope,
      courseRating: Number(tee!.course_rating),
      par: tee!.par_total,
    });
    const allowed = applyAllowance(raw, game!.hcp_allowance_pct);
    const { error: updateError } = await supabase
      .from('game_players')
      .update({ course_handicap: allowed })
      .eq('game_id', gameId)
      .eq('user_id', row.user_id);
    if (updateError) redirect(`${detailPath}?error=db_players`);
  }

  const { error: statusError } = await supabase
    .from('games')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', gameId);
  if (statusError) redirect(`${detailPath}?error=db_game`);

  redirect(`${detailPath}?status=started`);
}

/**
 * Admin override: approve a submitted scorecard regardless of flight
 * membership. Same idempotent guard as the peer flow (only updates rows
 * that are still pending approval). Refuses to run on non-active games.
 */
export async function adminApproveScorecard(
  gameId: string,
  playerUserId: string,
) {
  const { supabase, user } = await requireAdmin();
  const detailPath = `/admin/games/${gameId}`;

  const { data: game } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single<{ status: 'draft' | 'active' | 'finished' }>();
  if (!game) redirect(`${detailPath}?error=not_found`);
  if (game!.status !== 'active') {
    redirect(`${detailPath}?error=not_active`);
  }

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
  if (error) redirect(`${detailPath}?error=db_players`);

  redirect(`${detailPath}?status=admin_approved`);
}
