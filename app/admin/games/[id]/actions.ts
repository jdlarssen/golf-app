'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
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

/**
 * Admin: flip a scheduled game to active. This is the moment scoring becomes
 * possible — score writes are RLS-gated on status='active' and the leaderboard
 * reads `game_players.course_handicap` to compute strokes.
 *
 * The publish path (D2 createAndStartAction) deliberately leaves
 * `course_handicap = null` because the round hasn't started yet and the roster
 * can still be edited. We freeze handicaps HERE, immediately before flipping
 * to 'active', so they reflect each player's hcp_index at tee-off time.
 *
 * If the function crashes mid-loop, some players have course_handicap set and
 * some don't, but the game is still 'scheduled' so the admin can retry —
 * each retry re-computes and overwrites (idempotent).
 */
export async function startScheduledGame(gameId: string) {
  const { supabase } = await requireAdmin();
  const detailPath = `/admin/games/${gameId}`;

  // 1. Verify status is still 'scheduled' and load tee-box + allowance.
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, status, hcp_allowance_pct, tee_boxes(slope, course_rating, par_total)',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      status: GameStatus;
      hcp_allowance_pct: number;
      tee_boxes: { slope: number; course_rating: number; par_total: number } | null;
    }>();
  if (gameError || !game) redirect(`${detailPath}?error=not_found`);
  if (game!.status !== 'scheduled') {
    redirect(`${detailPath}?error=not_startable`);
  }
  const tee = game!.tee_boxes;
  if (!tee) redirect(`${detailPath}?error=tee_missing`);

  // 2. Load all players + their hcp_index.
  const { data: roster, error: rosterError } = await supabase
    .from('game_players')
    .select('user_id, users!game_players_user_id_fkey(hcp_index)')
    .eq('game_id', gameId)
    .returns<{ user_id: string; users: { hcp_index: number | string } | null }[]>();
  if (rosterError) redirect(`${detailPath}?error=db_players`);
  if (!roster || roster.length === 0) {
    redirect(`${detailPath}?error=roster_empty`);
  }

  // 3. Compute course_handicap per player, then write it back.
  for (const row of roster!) {
    if (!row.users) continue; // defensive — shouldn't happen given FK constraint
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

  // 4. Flip status to active with optimistic-lock guard (re-check, in case
  // E1's auto-start fallback beat us to it from the player-side page).
  const { error: flipError } = await supabase
    .from('games')
    .update({ status: 'active', started_at: new Date().toISOString() })
    .eq('id', gameId)
    .eq('status', 'scheduled');
  if (flipError) redirect(`${detailPath}?error=db_game`);

  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  redirect(`${detailPath}?status=started`);
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
    .single<{ status: 'draft' | 'scheduled' | 'active' | 'finished' }>();
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

/**
 * Admin: end an active game. All players must have submitted, and (if peer
 * approval is required) all submissions must be approved. Flips the game to
 * `finished` and stamps `ended_at`, which opens the leaderboard for everyone.
 */
export async function endGame(gameId: string) {
  const { supabase } = await requireAdmin();
  const detailPath = `/admin/games/${gameId}`;

  // Verify game is active
  const { data: game } = await supabase
    .from('games')
    .select('id, status, require_peer_approval')
    .eq('id', gameId)
    .single<{ id: string; status: GameStatus; require_peer_approval: boolean }>();
  if (!game || game.status !== 'active') {
    redirect(`${detailPath}?error=not_active`);
  }

  // Verify every player has submitted; if require_peer_approval, every
  // submission must also be approved.
  const { data: players } = await supabase
    .from('game_players')
    .select('submitted_at, approved_at')
    .eq('game_id', gameId)
    .returns<{ submitted_at: string | null; approved_at: string | null }[]>();

  if (!players || players.length === 0) {
    redirect(`${detailPath}?error=no_players`);
  }
  for (const p of players!) {
    if (!p.submitted_at) {
      redirect(`${detailPath}?error=not_all_submitted`);
    }
    if (game!.require_peer_approval && !p.approved_at) {
      redirect(`${detailPath}?error=not_all_approved`);
    }
  }

  const { error } = await supabase
    .from('games')
    .update({ status: 'finished', ended_at: new Date().toISOString() })
    .eq('id', gameId);

  if (error) redirect(`${detailPath}?error=db_finish`);

  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  redirect(`${detailPath}?status=finished`);
}

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';
