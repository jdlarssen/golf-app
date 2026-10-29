'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { expireGameCache } from '@/lib/games/expireGameCache';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { safeParsePrizes } from '@/lib/games/prizes';
import { SPONSOR_LOGO_BUCKET } from '@/lib/storage/sponsorLogoUrl';
import type { GameStatus } from '@/lib/games/status';
import { canCancelWithNotice } from '@/lib/games/gameCancellation';
import { normalizeCancelMessage } from '@/lib/games/cancelMessage';
import {
  loadCancellationRecipients,
  type CancellationRecipient,
} from '@/lib/games/gameCancellation.server';
import { notify } from '@/lib/notifications/notify';
import { archiveNotificationsForGame } from '@/lib/notifications/archive';
import type { NotificationPayload } from '@/lib/notifications/types';
import { sendGameCancelledNotification } from '@/lib/mail/gameCancelledNotification';
import { getPrivateUserFields } from '@/lib/users/privateUserFields';
import { firstName } from '@/lib/firstName';

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
  // #2481: tee-off, course and cup/league ties for the cancellation notice.
  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, prizes, scheduled_tee_off_at, tournament_id, league_round_id, courses(name)')
    .eq('id', gameId)
    .maybeSingle<{
      id: string;
      name: string;
      status: GameStatus;
      prizes: unknown;
      scheduled_tee_off_at: string | null;
      tournament_id: string | null;
      league_round_id: string | null;
      courses: { name: string } | null;
    }>();

  // Only reachable for an admin — a non-admin whose game doesn't exist was
  // already bounced to `/` by the gate above.
  if (!game) redirect({ href: '/admin/games?error=not_found', locale });

  // #428 (eier-beslutning): a creator may only delete a game that hasn't started
  // — draft/scheduled. Once it's active/finished, the round and its (shared)
  // leaderboard belong to every participant, so only an admin can remove it
  // (recovery). The /games/[id]/slett page already gates this; the action
  // self-gates too against a direct POST.
  if (!ctx.isAdmin && game.status !== 'draft' && game.status !== 'scheduled') {
    redirect({ href: `/games/${gameId}?error=not_deletable`, locale });
  }

  const slettHref = ctx.isAdmin ? `/admin/games/${gameId}/slett` : `/games/${gameId}/slett`;

  // #2481: a scheduled round cancels with a notice («Avlys og si fra»). The
  // greeting and the recipients are settled BEFORE the delete: the cascade
  // takes game_players with it, and nobody hears «avlyst» about a game that
  // is still there. The action reads the roster itself; the form only carries
  // the greeting.
  let notice: { recipients: CancellationRecipient[]; message: string | undefined } | null = null;
  if (canCancelWithNotice(game)) {
    const parsed = normalizeCancelMessage(formData.get('message'));
    if (!parsed.ok) redirect({ href: `${slettHref}?error=${parsed.error}`, locale });
    try {
      notice = {
        recipients: await loadCancellationRecipients(gameId, ctx.userId),
        message: parsed.message,
      };
    } catch (readErr) {
      // The page promised the players a notice; without the list, keep the game.
      console.error('[games] deleteGame recipients read failed', { gameId, readErr });
      redirect({ href: `${slettHref}?error=delete_failed`, locale });
    }
  }

  // Delete the game row. FK ON DELETE CASCADE handles game_players, scores and
  // invitations (0001). Cascade actions bypass child-table RLS, so a creator's
  // delete (allowed by the 0071 creator-delete policy on games) removes the
  // children regardless of their own RLS — same as the admin path.
  // `.select('id')` makes the row count visible: a delete RLS filtered to 0
  // rows returns no error (AGENTS.md trap 2), and must not send notices.
  const { data: deleted, error } = await supabase
    .from('games')
    .delete()
    .eq('id', gameId)
    .select('id');

  if (error || (deleted?.length ?? 0) === 0) {
    console.error('[games] deleteGame failed', { gameId, error, rows: deleted?.length ?? 0 });
    redirect({ href: `${slettHref}?error=delete_failed`, locale });
  }

  // #2481: the game's old notices (invite, player_added, …) leave every inbox,
  // for any delete. Best-effort, never throws.
  await archiveNotificationsForGame(gameId);

  if (notice) {
    await sendCancellationNotices(game, notice, ctx.name);
  }

  // #1052: rydd sponsorlogo-objects best-effort ETTER vellykket slett (feil
  // her skal aldri blokkere flyten — Resend-mønsteret). Service-role-klienten
  // er nødvendig: en admin som sletter andres spill eier ikke objektene, så
  // eier-scopet DELETE-RLS ville matchet 0 rader.
  const logoPaths = safeParsePrizes(game.prizes)
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

  expireGameCache(gameId);

  // #2481: after «Avlys og si fra» the banner says the round is cancelled and
  // how many were told. Any other delete keeps «er slettet», also a scheduled
  // round with only the organiser on the list (its page is the plain one).
  const told = notice && notice.recipients.length > 0 ? String(notice.recipients.length) : null;

  if (ctx.isAdmin) {
    const qs = new URLSearchParams(
      told ? { status: 'cancelled', name: game.name, count: told } : { status: 'deleted', name: game.name },
    );
    redirect({ href: `/admin/games?${qs.toString()}`, locale });
  }

  // Creator: no «Mine spill»-hub yet (Fase 3), so land on home with a
  // confirmation banner (eier-beslutning).
  const qs = new URLSearchParams(told ? { cancelled: game.name, told } : { deleted: game.name });
  redirect({ href: `/?${qs.toString()}`, locale });
}

/**
 * #2481: one `game_cancelled` notice per recipient, in parallel (up to ~150 on
 * a club roster), and the mail to those `notify` says are off-app. Runs after
 * the delete. Best-effort like every notice: a failed insert, push or mail is
 * logged and never stops the redirect.
 */
async function sendCancellationNotices(
  game: {
    name: string;
    scheduled_tee_off_at: string | null;
    courses: { name: string } | null;
  },
  notice: { recipients: CancellationRecipient[]; message: string | undefined },
  actorName: string | null,
): Promise<void> {
  const { recipients, message } = notice;
  if (recipients.length === 0) return;

  // An empty name or course would fail the schema's min(1) and drop the notice.
  const organizerName = actorName?.trim() || null;
  const courseName = game.courses?.name?.trim() || null;
  const payload: NotificationPayload<'game_cancelled'> = {
    game_name: game.name,
    tee_off_at: game.scheduled_tee_off_at,
    course_name: courseName,
    organizer_name: organizerName,
    ...(message ? { message } : {}),
  };

  const results = await Promise.allSettled(
    recipients.map((r) => notify({ userId: r.userId, kind: 'game_cancelled', payload })),
  );
  const offApp = recipients.filter((r, i) => {
    const res = results[i];
    if (res?.status === 'rejected') {
      console.error('[games] deleteGame notify failed', { userId: r.userId, reason: res.reason });
      return false;
    }
    return res?.value.shouldAlsoSendMail === true;
  });
  if (offApp.length === 0) return;

  try {
    const fields = await getPrivateUserFields(offApp.map((r) => r.userId));
    await Promise.allSettled(
      offApp.map((r) => {
        const to = fields.get(r.userId)?.email;
        if (!to) return Promise.resolve();
        return sendGameCancelledNotification({
          to,
          playerFirstName: firstName(r.name),
          gameName: game.name,
          teeOffAt: game.scheduled_tee_off_at,
          courseName,
          organizerName,
          message,
          locale: r.locale,
        }).catch((mailErr) => console.error('[games] deleteGame mail failed', { userId: r.userId, mailErr }));
      }),
    );
  } catch (mailErr) {
    console.error('[games] deleteGame mail lookup failed', mailErr);
  }
}
