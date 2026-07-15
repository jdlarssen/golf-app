'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { safeParsePrizes } from '@/lib/games/prizes';
import { SPONSOR_LOGO_BUCKET } from '@/lib/storage/sponsorLogoUrl';
import type { GameStatus } from '@/lib/games/status';

export async function deleteGame(formData: FormData) {
  const locale = await getLocale();
  const gameId = String(formData.get('gameId') ?? '');
  if (!gameId) redirect({ href: '/admin/games?error=not_found', locale });

  const supabase = await getServerClient();
  // #428: admin OR the game's creator. requireAdminOrCreator reads created_by
  // for non-admins, so a non-owner (or unauthenticated) is bounced to `/` here
  // before any delete can run.
  const ctx = await requireAdminOrCreator(supabase, gameId);

  // Fetch the game name (for the success banner) + status (for the creator
  // restriction below). No status block for admins — they must be able to
  // delete games in any state (test games, abandoned rounds where scorecards
  // were never submitted, which makes the normal endGame path unreachable).
  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, prizes')
    .eq('id', gameId)
    .maybeSingle<{
      id: string;
      name: string;
      status: GameStatus;
      prizes: unknown;
    }>();

  // Only reachable for an admin — a non-admin whose game doesn't exist was
  // already bounced to `/` by the gate above.
  if (!game) redirect({ href: '/admin/games?error=not_found', locale });

  // #428 (eier-beslutning): a creator may only delete a game that hasn't started
  // — draft/scheduled. Once it's active/finished, the round and its (shared)
  // leaderboard belong to every participant, so only an admin can remove it
  // (recovery). The /games/[id]/slett page already gates this; the action
  // self-gates too against a direct POST.
  if (!ctx.isAdmin && game!.status !== 'draft' && game!.status !== 'scheduled') {
    redirect({ href: `/games/${gameId}?error=not_deletable`, locale });
  }

  // Delete the game row. FK ON DELETE CASCADE handles game_players, scores and
  // invitations (0001). Cascade actions bypass child-table RLS, so a creator's
  // delete (allowed by the 0071 creator-delete policy on games) removes the
  // children regardless of their own RLS — same as the admin path.
  const { error } = await supabase.from('games').delete().eq('id', gameId);

  if (error) {
    console.error('[games] deleteGame failed', { gameId, error });
    redirect({
      href: ctx.isAdmin
        ? `/admin/games/${gameId}/slett?error=delete_failed`
        : `/games/${gameId}/slett?error=delete_failed`,
      locale,
    });
  }

  // #1052: rydd sponsorlogo-objects best-effort ETTER vellykket slett (feil
  // her skal aldri blokkere flyten — Resend-mønsteret). Service-role-klienten
  // er nødvendig: en admin som sletter andres spill eier ikke objektene, så
  // eier-scopet DELETE-RLS ville matchet 0 rader.
  const logoPaths = safeParsePrizes(game!.prizes)
    .map((p) => p.sponsorLogoPath)
    .filter((p): p is string => p != null);
  if (logoPaths.length > 0) {
    try {
      const { error: removeError } = await getAdminClient()
        .storage.from(SPONSOR_LOGO_BUCKET)
        .remove(logoPaths);
      if (removeError) {
        console.error('[games] deleteGame logo cleanup failed', {
          gameId,
          removeError,
        });
      }
    } catch (cleanupErr) {
      console.error('[games] deleteGame logo cleanup failed', {
        gameId,
        cleanupErr,
      });
    }
  }

  revalidateTag(`game-${gameId}`, 'max');

  if (ctx.isAdmin) {
    const qs = new URLSearchParams({ status: 'deleted', name: game!.name });
    redirect({ href: `/admin/games?${qs.toString()}`, locale });
  }

  // Creator: no «Mine spill»-hub yet (Fase 3), so land on home with a
  // confirmation banner (eier-beslutning).
  redirect({ href: `/?deleted=${encodeURIComponent(game!.name)}`, locale });
}
