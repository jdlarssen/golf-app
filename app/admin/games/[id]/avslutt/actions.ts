'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { sendGameFinishedNotification } from '@/lib/mail/gameFinishedNotification';
import { buildGameFinishedRecipients } from '@/lib/mail/gameFinishedRecipients';
import { firstName } from '@/lib/firstName';
import { logAdminEvent } from '@/lib/admin/auditLog';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

async function requireAdmin() {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin, name')
    .eq('id', user.id)
    .single<{ is_admin: boolean; name: string | null }>();
  if (!profile?.is_admin) redirect('/');

  return { supabase, user, actorName: profile.name?.trim() || 'Admin' };
}

/**
 * Admin server action: record LD/CTP winners for a side-tournament-enabled
 * game and flip the game to `finished` in one transaction-like flow. Mirrors
 * the validation in `endGame` (all players submitted, optionally approved)
 * and the best-effort "Resultatet er klart"-mail blast.
 *
 * Winners are upserted on the (game_id, category, position) PK so the action
 * is idempotent — re-submitting the wizard simply overwrites the previous
 * selection. The status flip happens AFTER the winners insert so a partial
 * failure leaves the game in `active` and the admin can retry.
 */
export async function endGameWithSideWinners(
  gameId: string,
  formData: FormData,
) {
  const { supabase, user, actorName } = await requireAdmin();
  const detailPath = `/admin/games/${gameId}`;
  const wizardPath = `${detailPath}/avslutt`;

  // Inkluderer course_id + game_mode + mode_config slik at den mode-aware
  // completion-mail-blasten (via buildGameFinishedRecipients) ikke trenger
  // en re-fetch av game-raden.
  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, require_peer_approval, side_tournament_enabled, side_ld_count, side_ctp_count, course_id, game_mode, mode_config',
    )
    .eq('id', gameId)
    .single<{
      id: string;
      name: string;
      status: GameStatus;
      require_peer_approval: boolean;
      side_tournament_enabled: boolean;
      side_ld_count: number;
      side_ctp_count: number;
      course_id: string;
      game_mode: GameMode;
      mode_config: GameModeConfig;
    }>();

  if (!game || game.status !== 'active') {
    redirect(`${detailPath}?error=not_active`);
  }

  // Parse winners. Each dropdown is named ld_winner_N / ctp_winner_N where
  // N is the slot position (1-based). Value: user_id (uuid string) or "none"
  // → null. Missing or empty values redirect back to the wizard.
  type Winner = {
    category: 'longest_drive' | 'closest_to_pin';
    position: 1 | 2;
    winner_user_id: string | null;
  };

  const winners: Winner[] = [];

  for (let pos = 1; pos <= game!.side_ld_count; pos++) {
    const raw = formData.get(`ld_winner_${pos}`);
    if (typeof raw !== 'string' || raw === '') {
      redirect(`${wizardPath}?error=missing_ld_${pos}`);
    }
    winners.push({
      category: 'longest_drive',
      position: pos as 1 | 2,
      winner_user_id: raw === 'none' ? null : (raw as string),
    });
  }
  for (let pos = 1; pos <= game!.side_ctp_count; pos++) {
    const raw = formData.get(`ctp_winner_${pos}`);
    if (typeof raw !== 'string' || raw === '') {
      redirect(`${wizardPath}?error=missing_ctp_${pos}`);
    }
    winners.push({
      category: 'closest_to_pin',
      position: pos as 1 | 2,
      winner_user_id: raw === 'none' ? null : (raw as string),
    });
  }

  // Verify all players submitted (mirrors endGame validation).
  const { data: players } = await supabase
    .from('game_players')
    .select(
      'submitted_at, approved_at, users!game_players_user_id_fkey(email, name)',
    )
    .eq('game_id', gameId)
    .returns<
      {
        submitted_at: string | null;
        approved_at: string | null;
        users: { email: string | null; name: string | null } | null;
      }[]
    >();

  if (!players || players.length === 0) {
    redirect(`${detailPath}?error=no_players`);
  }
  for (const p of players!) {
    if (!p.submitted_at) redirect(`${detailPath}?error=not_all_submitted`);
    if (game!.require_peer_approval && !p.approved_at) {
      redirect(`${detailPath}?error=not_all_approved`);
    }
  }

  // Insert winners FIRST (idempotent on PK).
  if (winners.length > 0) {
    const rows = winners.map((w) => ({
      game_id: gameId,
      category: w.category,
      position: w.position,
      winner_user_id: w.winner_user_id,
    }));
    const { error: winnerErr } = await supabase
      .from('game_side_winners')
      .upsert(rows, { onConflict: 'game_id,category,position' });
    if (winnerErr) {
      console.error(
        '[endGameWithSideWinners] winners insert failed',
        winnerErr,
      );
      redirect(`${wizardPath}?error=db_winners`);
    }
  }

  // Flip game to finished.
  const { error: statusErr } = await supabase
    .from('games')
    .update({ status: 'finished', ended_at: new Date().toISOString() })
    .eq('id', gameId);
  if (statusErr) redirect(`${detailPath}?error=db_finish`);

  await logAdminEvent({
    actorId: user.id,
    actorName,
    eventType: 'game.finished',
    targetType: 'game',
    targetId: gameId,
    payload: {
      gameName: game!.name,
      sideTournament: true,
      sideWinners: winners,
    },
  });

  // Best-effort: send "Resultatet er klart"-mail to every player. Failures
  // are logged but never abort — leaderboard is reachable in-app regardless.
  //
  // Mode-aware payload: helperen returnerer per-spiller rank+poeng for
  // stableford og kun email/name for best-ball (default nøytral copy).
  const recipients = await buildGameFinishedRecipients(supabase, gameId, {
    course_id: game!.course_id,
    game_mode: game!.game_mode,
    mode_config: game!.mode_config,
  });
  if (recipients.length > 0) {
    const results = await Promise.allSettled(
      recipients.map((r) =>
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
        console.error(
          '[endGameWithSideWinners] game-finished mail failed',
          r.reason,
        );
      }
    }
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  redirect(`${detailPath}?status=finished`);
}
