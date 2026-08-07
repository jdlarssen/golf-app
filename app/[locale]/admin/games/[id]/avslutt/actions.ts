'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { endGameCore, type EndGameSideWinner } from '@/lib/games/endGameCore';
import type { GameStatus } from '@/lib/games/status';

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
 * Admin/creator server action: record LD/CTP winners for a side-tournament-
 * enabled game and flip it to `finished`. #1488 (K1): the finish pipeline now
 * lives entirely in `endGameCore`; this action is the thin wrapper that
 *
 *  1. parses the winner dropdowns from `formData` (each named `ld_winner_N` /
 *     `ctp_winner_N`; missing/empty → back to the wizard),
 *  2. calls `endGameCore` with `sideWinners` (upserted before the status flip),
 *     `auditExtras` (so the audit payload keeps `sideTournament` + `sideWinners`)
 *     and `logContext: 'endGameWithSideWinners'`,
 *  3. maps the core result back to the exact redirects this flow used before
 *     (`missing_ld_N`/`missing_ctp_N`/`not_active`/`no_players`/
 *     `not_all_submitted`/`not_all_approved`/`db_winners`/`db_finish`).
 *
 * Winners are upserted on the (game_id, category, position) PK so the action is
 * idempotent, and the flip runs AFTER the upsert — a partial failure leaves the
 * game `active` (`?error=db_winners`) and the organiser can retry.
 *
 * `allowMissing` mirrors the «avslutt likevel»-escape in `endGame` (#375):
 * players who never submitted are skipped instead of blocking the end. The
 * peer-approval gate is NOT relaxed (that's #360). Bound before `formData` so
 * the wizard form can pre-bind it.
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

  // Slot counts (+ status) drive winner parsing. A separate, slim read — not a
  // pipeline step (that all lives in `endGameCore`); the status pre-check
  // preserves the old order (an inactive game short-circuits to `not_active`
  // before any winner-slot redirect).
  const { data: game } = await supabase
    .from('games')
    .select('id, status, side_ld_count, side_ctp_count')
    .eq('id', gameId)
    .single<{
      id: string;
      status: GameStatus;
      side_ld_count: number;
      side_ctp_count: number;
    }>();

  if (!game || game.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }

  // Parse winners. Each dropdown is named ld_winner_N / ctp_winner_N where
  // N is the slot position (1-based). Value: user_id (uuid string) or "none"
  // → null. Missing or empty values redirect back to the wizard.
  const winners: EndGameSideWinner[] = [];

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

  // Single finish pipeline. Same request-scoped client as `endGame` (creator-
  // UPDATE RLS, migration 0071); winners upsert under the same client, so authz
  // is unchanged from the old inline action.
  const result = await endGameCore(
    supabase,
    gameId,
    { id: user.id, name: actorName },
    {
      allowMissing,
      sideWinners: winners,
      auditExtras: { sideTournament: true, sideWinners: winners },
      logContext: 'endGameWithSideWinners',
    },
  );

  if (!result.ok) {
    // `db_winners` lands back on the wizard (the winner picks are still there);
    // everything else on the detail page, byte-identical to the old redirects.
    const href =
      result.reason === 'db_winners'
        ? `${wizardPath}?error=db_winners`
        : `${detailPath}?error=${result.reason}`;
    redirect({ href, locale });
  }

  // endGameCore already ran the full pipeline + revalidated the game paths.
  redirect({ href: `${detailPath}?status=finished`, locale });
}
