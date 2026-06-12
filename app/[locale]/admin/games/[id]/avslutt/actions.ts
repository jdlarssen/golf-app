'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { sendGameFinishedNotification } from '@/lib/mail/gameFinishedNotification';
import { buildGameFinishedRecipients } from '@/lib/mail/gameFinishedRecipients';
import { firstName } from '@/lib/firstName';
import { logAdminEvent } from '@/lib/admin/auditLog';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import { notifyPlayersGameFinished } from '@/lib/notifications/events';

/**
 * Self-gate + load action context for `endGameWithSideWinners`. #427 opens the
 * finish flow to a game's CREATOR (not just admins) via `requireAdminOrCreator`,
 * and surfaces `isAdmin` so the action can branch its redirects (admin →
 * `/admin/games/*`, creator → `/games/*`).
 */
async function loadFinishContext(gameId: string) {
  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, gameId);
  return {
    supabase,
    user: { id: role.userId },
    actorName: role.name?.trim() || (role.isAdmin ? 'Admin' : 'Arrangør'),
    isAdmin: role.isAdmin,
  };
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
 *
 * `allowMissing` mirrors the «avslutt likevel»-escape in `endGame` (#375):
 * when true, players who never submitted are skipped instead of blocking the
 * end (their `submitted_at` stays null). The peer-approval gate is NOT relaxed
 * (that's #360). Bound before `formData` so the wizard form can pre-bind it.
 */
export async function endGameWithSideWinners(
  gameId: string,
  allowMissing: boolean,
  formData: FormData,
) {
  const locale = await getLocale();
  const { supabase, user, actorName, isAdmin } = await loadFinishContext(gameId);
  const detailPath = isAdmin ? `/admin/games/${gameId}` : `/games/${gameId}`;
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
    redirect({ href: `${detailPath}?error=not_active`, locale });
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
      redirect({ href: `${wizardPath}?error=missing_ld_${pos}`, locale });
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
      redirect({ href: `${wizardPath}?error=missing_ctp_${pos}`, locale });
    }
    winners.push({
      category: 'closest_to_pin',
      position: pos as 1 | 2,
      winner_user_id: raw === 'none' ? null : (raw as string),
    });
  }

  // Verify all players submitted (mirrors endGame validation). Inkluderer
  // user_id slik at game_finished-notify-loopen nedenfor kan target hver
  // deltaker uten ekstra DB-runde.
  const { data: players } = await supabase
    .from('game_players')
    .select(
      'user_id, submitted_at, approved_at, withdrawn_at, users!game_players_user_id_fkey(email, name)',
    )
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        submitted_at: string | null;
        approved_at: string | null;
        withdrawn_at: string | null;
        users: { email: string | null; name: string | null } | null;
      }[]
    >();

  if (!players || players.length === 0) {
    redirect({ href: `${detailPath}?error=no_players`, locale });
  }
  for (const p of players!) {
    // Withdrawn (WD, #386): out of the ranking — never blocks the end.
    if (p.withdrawn_at) continue;
    if (!p.submitted_at) {
      // No-show: «avslutt likevel» skips them (submitted_at stays null).
      if (!allowMissing) redirect({ href: `${detailPath}?error=not_all_submitted`, locale });
      continue;
    }
    if (game!.require_peer_approval && !p.approved_at) {
      redirect({ href: `${detailPath}?error=not_all_approved`, locale });
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
      redirect({ href: `${wizardPath}?error=db_winners`, locale });
    }
  }

  // Flip game to finished.
  const { error: statusErr } = await supabase
    .from('games')
    .update({ status: 'finished', ended_at: new Date().toISOString() })
    .eq('id', gameId);
  if (statusErr) redirect({ href: `${detailPath}?error=db_finish`, locale });

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

  // Best-effort in-app `game_finished`-varsel til hver deltaker. Loopen fyres
  // parallelt med mail-blasten lenger ned. Phase 4-gating: aktive spillere
  // (last_seen_at < 5 min) får kun in-app; off-app-spillere får mail som
  // backup. Notify-feil → ikke send mail (samme rasjonale som inni notify()).
  const sendMailByUserId = await notifyPlayersGameFinished(
    players!,
    { id: gameId, name: game!.name },
    'endGameWithSideWinners',
  );

  // Best-effort: send "Resultatet er klart"-mail kun til off-app-spillere.
  // Failures er loggført men aborter aldri — leaderboardet er tilgjengelig
  // in-app uansett.
  //
  // Mode-aware payload: helperen returnerer per-spiller rank+poeng for
  // stableford og kun userId/email/name for best-ball (default nøytral copy).
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
  redirect({ href: `${detailPath}?status=finished`, locale });
}
