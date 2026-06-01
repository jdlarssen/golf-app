'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import {
  calculateCourseHandicap,
  applyAllowance,
} from '@/lib/scoring/courseHandicap';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import { findPendingPlayers } from '@/lib/games/pendingPlayers';
import {
  getRatingForGender,
  type TeeBoxRatings,
  type TeeGender,
} from '@/lib/games/teeRating';
import { sendGameFinishedNotification } from '@/lib/mail/gameFinishedNotification';
import { buildGameFinishedRecipients } from '@/lib/mail/gameFinishedRecipients';
import { firstName } from '@/lib/firstName';
import { logAdminEvent } from '@/lib/admin/auditLog';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import { notify } from '@/lib/notifications/notify';
import { notifyPlayersGameFinished } from '@/lib/notifications/events';

/**
 * Self-gate + load action context for the game-detail actions. Wraps the
 * shared `requireAdmin` helper so each action below can keep destructuring
 * `{ supabase, user, actorName }` like it did with the previously-inlined
 * `requireAdmin()` function. Prepares for Fase 4 chunk 2 (#223) lifting
 * the admin-layout-gate.
 */
async function loadAdminContext() {
  const supabase = await getServerClient();
  const role = await requireAdmin(supabase);
  return {
    supabase,
    user: { id: role.userId },
    actorName: role.name?.trim() || 'Admin',
  };
}

/**
 * Admin server action: flip a scheduled game to active. Delegates to the
 * shared `startScheduledGame` helper (in `lib/games/`) which is also used
 * by the E1 server-side auto-start fallback on `/games/[id]`.
 *
 * The publish path (D2 createAndStartAction) deliberately leaves
 * `course_handicap = null` because the round hasn't started yet and the
 * roster can still be edited. The helper freezes handicaps just before
 * flipping to 'active' so they reflect each player's hcp_index at tee-off.
 */
export async function startScheduledGameAction(gameId: string) {
  const { supabase } = await loadAdminContext();
  const detailPath = `/admin/games/${gameId}`;

  const result = await startScheduledGame(supabase, gameId);
  if (!result.ok) {
    if (result.reason === 'pending_players' && result.pendingEmails) {
      const qs = new URLSearchParams({
        error: 'pending_players',
        emails: result.pendingEmails.join(', '),
      });
      redirect(`${detailPath}?${qs.toString()}`);
    }
    redirect(`${detailPath}?error=${result.reason}`);
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  redirect(`${detailPath}?status=started`);
}

export async function startGame(gameId: string) {
  const { supabase } = await loadAdminContext();
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

  const { data: gamePlayers, error: gpError } = await supabase
    .from('game_players')
    .select('user_id, tee_gender, users(hcp_index)')
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        tee_gender: TeeGender;
        users: { hcp_index: number | string } | null;
      }[]
    >();
  if (gpError || !gamePlayers) redirect(`${detailPath}?error=db_roster`);

  // The game has one tee with up to three rating-sets. Each player picks
  // which set applies via their tee_gender flag.
  const { data: tee, error: teeError } = await supabase
    .from('tee_boxes')
    .select(
      'slope_mens, course_rating_mens, par_total_mens, slope_ladies, course_rating_ladies, par_total_ladies, slope_juniors, course_rating_juniors, par_total_juniors',
    )
    .eq('id', game!.tee_box_id)
    .single<TeeBoxRatings>();
  if (teeError || !tee) redirect(`${detailPath}?error=db_tee`);

  // Defence-in-depth: refuse to flip a draft to active if any roster player
  // is still pending profile completion. Mirrors the gate in
  // `startScheduledGame` so both start-paths behave identically.
  const rosterIds = gamePlayers!.map((row) => row.user_id);
  const { data: rosterUsers, error: rosterUsersError } = await supabase
    .from('users')
    .select('id, email, profile_completed_at')
    .in('id', rosterIds);
  if (rosterUsersError || !rosterUsers) {
    redirect(`${detailPath}?error=db_roster`);
  }
  const pending = findPendingPlayers(rosterUsers!);
  if (pending.length > 0) {
    const qs = new URLSearchParams({
      error: 'pending_players',
      emails: pending.map((p) => p.email).join(', '),
    });
    redirect(`${detailPath}?${qs.toString()}`);
  }

  // Freeze a course handicap per player using their gender-specific
  // rating-set on the game's tee.
  for (const row of gamePlayers!) {
    if (!row.users) continue;
    const rating = getRatingForGender(tee!, row.tee_gender);
    if (!rating) redirect(`${detailPath}?error=tee_missing_rating`);
    const raw = calculateCourseHandicap({
      hcpIndex: Number(row.users.hcp_index),
      slope: rating!.slope,
      courseRating: rating!.courseRating,
      par: rating!.par,
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

  revalidateTag(`game-${gameId}`, 'max');
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
  const { supabase, user, actorName } = await loadAdminContext();
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

  await logAdminEvent({
    actorId: user.id,
    actorName,
    eventType: 'scorecard.approved',
    targetType: 'scorecard',
    targetId: gameId,
    payload: { gameId, playerUserId },
  });

  // Best-effort in-app varsel til submitter — admin-godkjenning teller på
  // samme måte som peer-godkjenning fra spillerens perspektiv. Vi henter
  // game.name og bruker actorName fra requireAdmin() (allerede strippet).
  try {
    const { data: gameRow } = await supabase
      .from('games')
      .select('name')
      .eq('id', gameId)
      .single<{ name: string }>();
    const gameName = gameRow?.name ?? '(ukjent spill)';
    await notify({
      userId: playerUserId,
      kind: 'scorecard_approved',
      payload: {
        game_id: gameId,
        game_name: gameName,
        approver_name: actorName,
      },
    });
  } catch (err) {
    console.error(
      '[adminApproveScorecard] scorecard_approved notify failed',
      err,
    );
  }

  revalidateTag(`game-${gameId}`, 'max');
  redirect(`${detailPath}?status=admin_approved`);
}

/**
 * Admin: end an active game. All players must have submitted, and (if peer
 * approval is required) all submissions must be approved. Flips the game to
 * `finished` and stamps `ended_at`, which opens the leaderboard for everyone.
 *
 * `allowMissing` is the «avslutt likevel»-escape (#375): when true, players who
 * never submitted are skipped instead of blocking the end. Their `submitted_at`
 * stays `null` — they're never marked as a false submission; the «ikke
 * levert»-state is derived (`finished && submitted_at == null`) and their
 * registered scores still count in the leaderboard. The peer-approval gate is
 * intentionally NOT relaxed (that lock is #360's domain): a submitted-but-
 * unapproved scorecard still blocks, even when forcing.
 */
export async function endGame(gameId: string, allowMissing = false) {
  const { supabase, user, actorName } = await loadAdminContext();
  const detailPath = `/admin/games/${gameId}`;

  // Verify game is active. Inkluderer game_mode + mode_config + course_id
  // slik at vi kan bygge mode-aware completion-mail uten å re-fetche game.
  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, require_peer_approval, course_id, game_mode, mode_config',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: GameStatus;
      require_peer_approval: boolean;
      course_id: string;
      game_mode: GameMode;
      mode_config: GameModeConfig;
    }>();
  if (!game || game.status !== 'active') {
    redirect(`${detailPath}?error=not_active`);
  }

  // Verify every player has submitted; if require_peer_approval, every
  // submission must also be approved. Also collect user_id + email + name
  // her so we can fire både in-app `game_finished`-varsler (user_id) og
  // «Resultatet er klart»-mail (email/name) etter status-flippen uten
  // ekstra DB-runde.
  const { data: players } = await supabase
    .from('game_players')
    .select(
      'user_id, submitted_at, approved_at, users!game_players_user_id_fkey(email, name)',
    )
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        submitted_at: string | null;
        approved_at: string | null;
        users: { email: string | null; name: string | null } | null;
      }[]
    >();

  if (!players || players.length === 0) {
    redirect(`${detailPath}?error=no_players`);
  }
  for (const p of players!) {
    if (!p.submitted_at) {
      // No-show: block by default, but let «avslutt likevel» skip past them.
      // submitted_at stays null — they show as «ikke levert», never a false
      // levering; their registered scores still count in the leaderboard.
      if (!allowMissing) {
        redirect(`${detailPath}?error=not_all_submitted`);
      }
      continue;
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

  await logAdminEvent({
    actorId: user.id,
    actorName,
    eventType: 'game.finished',
    targetType: 'game',
    targetId: gameId,
    payload: { gameName: game!.name },
  });

  // Best-effort in-app `game_finished`-varsel til hver deltaker. Loopen fyres
  // parallelt med mail-blasten lenger ned. Phase 4-gating: aktive spillere
  // (last_seen_at < 5 min) får kun in-app; off-app-spillere får mail som
  // backup. Notify-feil → ikke send mail (samme rasjonale som inni notify()).
  const sendMailByUserId = await notifyPlayersGameFinished(
    players!,
    { id: gameId, name: game!.name },
    'endGame',
  );

  // Best-effort: send "Resultatet er klart"-mail kun til off-app-spillere.
  // Failures er loggført men aborter aldri actionen — leaderboardet er
  // tilgjengelig in-app uansett, og admin kan re-trigge ved behov (ingen
  // resend-flyt finnes ennå, men DB er source of truth).
  //
  // Mode-aware payload: for stableford regner helperen ut leaderboard og
  // legger per-spiller rank/poeng på hver mottaker; for best-ball returnerer
  // den kun userId/email/name (mailen bruker da default nøytral copy).
  const recipients = await buildGameFinishedRecipients(supabase, gameId, {
    course_id: game!.course_id,
    game_mode: game!.game_mode,
    mode_config: game!.mode_config,
  });
  const mailRecipients = recipients.filter(
    (r) => sendMailByUserId.get(r.userId) === true,
  );
  if (mailRecipients.length > 0) {
    const results = await Promise.allSettled(
      mailRecipients.map((r) =>
        sendGameFinishedNotification({
          to: r.email,
          playerFirstName: firstName(r.name),
          gameName: game!.name,
          gameId,
          mode: r.mode,
        }),
      ),
    );
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('[endGame] game-finished mail failed', r.reason);
      }
    }
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  redirect(`${detailPath}?status=finished`);
}

/**
 * Admin: clear a player's submission so they can edit and re-submit. Wipes
 * submitted_at, any approval, and any prior rejection_reason — the row goes
 * back to a clean in-progress state. Players see the game as active again
 * and can write scores.
 *
 * No-op safety: only runs when the row currently has submitted_at set.
 */
export async function reopenScorecard(gameId: string, playerUserId: string) {
  const { supabase, user, actorName } = await loadAdminContext();
  const detailPath = `/admin/games/${gameId}`;

  const { data: game } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single<{ status: GameStatus }>();
  if (!game) redirect(`${detailPath}?error=not_found`);
  if (game!.status !== 'active') {
    redirect(`${detailPath}?error=not_active`);
  }

  const { error } = await supabase
    .from('game_players')
    .update({
      submitted_at: null,
      approved_at: null,
      approved_by_user_id: null,
      rejection_reason: null,
    })
    .eq('game_id', gameId)
    .eq('user_id', playerUserId)
    .not('submitted_at', 'is', null);
  if (error) redirect(`${detailPath}?error=db_players`);

  await logAdminEvent({
    actorId: user.id,
    actorName,
    eventType: 'scorecard.reopened',
    targetType: 'scorecard',
    targetId: gameId,
    payload: { gameId, playerUserId },
  });

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  redirect(`${detailPath}?status=scorecard_reopened`);
}

/**
 * Admin: flip a finished game back to active. Clears ended_at so the
 * leaderboard hides again and players can edit scores. Useful when the
 * round was ended prematurely or a result needs correction.
 */
export async function reopenGame(gameId: string) {
  const { supabase, user, actorName } = await loadAdminContext();
  const detailPath = `/admin/games/${gameId}`;

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status')
    .eq('id', gameId)
    .single<{ id: string; name: string; status: GameStatus }>();
  if (!game) redirect(`${detailPath}?error=not_found`);
  if (game!.status !== 'finished') {
    redirect(`${detailPath}?error=not_finished`);
  }

  const { error } = await supabase
    .from('games')
    .update({ status: 'active', ended_at: null })
    .eq('id', gameId);
  if (error) redirect(`${detailPath}?error=db_game`);

  await logAdminEvent({
    actorId: user.id,
    actorName,
    eventType: 'game.reopened',
    targetType: 'game',
    targetId: gameId,
    payload: { gameName: game!.name },
  });

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/games/${gameId}/leaderboard`);
  redirect(`${detailPath}?status=game_reopened`);
}

