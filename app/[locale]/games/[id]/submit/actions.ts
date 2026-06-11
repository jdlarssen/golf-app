'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { sendScorecardSubmittedNotification } from '@/lib/mail/scorecardSubmittedNotification';
import { firstName } from '@/lib/firstName';
import { notify } from '@/lib/notifications/notify';
import { peersForApproval } from '@/lib/games/flightScope';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * Mark the current user's scorecard as submitted.
 *
 * Idempotent: the `.is('submitted_at', null)` guard means a second call
 * after the first has succeeded matches zero rows. We re-fetch the matched
 * rows via `.select()` and skip the notify/mail side-effects when none —
 * Supabase returns `error == null` even with 0 rows updated, so without the
 * row-count check a double-click or race-condition re-submit would fire
 * peer + admin notifications and admin mails on every call. Also refuses
 * to mark when the game is no longer active.
 *
 * Side-effect: best-effort "Scorekort levert"-mail to every admin (except
 * the submitter themselves) so the godkjennings-flyten can start without
 * the admin polling the app.
 */
export async function submitScorecard(gameId: string) {
  const locale = await getLocale();
  const supabase = await getServerClient();
  const {
    data: { user: maybeUser },
  } = await supabase.auth.getUser();
  if (!maybeUser) redirect({ href: '/login', locale });
  const user = maybeUser!;

  // Refuse to submit if the game isn't active. Draft games shouldn't have
  // scores yet and finished games are read-only. `name` is fetched here so
  // we can use it as the mail subject + body without a re-fetch.
  // `require_peer_approval` brukes nedenfor til å gate peer-varsel-loopen.
  // `game_mode` trengs for peersForApproval (#543).
  const { data: game } = await supabase
    .from('games')
    .select('name, status, require_peer_approval, game_mode')
    .eq('id', gameId)
    .single<{
      name: string;
      status: 'draft' | 'scheduled' | 'active' | 'finished';
      require_peer_approval: boolean;
      game_mode: string;
    }>();

  if (!game || game.status !== 'active') {
    redirect({ href: `/games/${gameId}/submit?error=not_active` as string, locale });
  }

  // Withdrawn (#387): a trukket spiller can't submit. The submit page redirects
  // them away, but a direct POST to this action must also be refused — defense-
  // in-depth. Bounce to game-home, which renders the «Du har trukket deg»-banner.
  const { data: meRow } = await supabase
    .from('game_players')
    .select('withdrawn_at')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle<{ withdrawn_at: string | null }>();

  if (meRow?.withdrawn_at) {
    redirect({ href: `/games/${gameId}` as string, locale });
  }

  const { data: updated, error } = await supabase
    .from('game_players')
    .update({
      submitted_at: new Date().toISOString(),
      // A previous rejection clears once the player re-submits.
      rejection_reason: null,
    })
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .is('submitted_at', null)
    .select('user_id');

  if (error) {
    redirect({ href: `/games/${gameId}/submit?error=db` as string, locale });
  }

  // Zero rows = already submitted (re-click or race). Skip notify + mail
  // but keep the revalidate + redirect so UX matches a fresh submit.
  if ((updated?.length ?? 0) === 0) {
    revalidateTag(`game-${gameId}`, 'max');
    revalidatePath(`/games/${gameId}`);
    redirect({ href: `/games/${gameId}?status=submitted` as string, locale });
  }

  // Best-effort admin notification + peer in-app varsel. Tre queries fyres
  // i parallell:
  //   1) the submitter's own name (for mail body + notify-payload)
  //   2) every admin's email + name (mail recipients + notify-targets)
  //   3) alle aktive spillere i spillet (for peersForApproval — #543).
  // The submitter is filtered out of recipients so a player-admin who
  // submits their own scorecard doesn't mail themselves a notification.
  // Peers-query gates på require_peer_approval — for spill uten
  // peer-godkjenning sparer vi en DB-runde per submit (klubb-skala-perf).
  const peersQuery = game!.require_peer_approval
    ? supabase
        .from('game_players')
        .select('user_id, flight_number, withdrawn_at')
        .eq('game_id', gameId)
        .returns<
          { user_id: string; flight_number: number | null; withdrawn_at: string | null }[]
        >()
    : Promise.resolve({ data: null });

  const [playerRes, adminsRes, peersRes] = await Promise.all([
    supabase.from('users').select('name').eq('id', user.id).maybeSingle<{
      name: string | null;
    }>(),
    supabase
      .from('users')
      .select('id, email, name')
      .eq('is_admin', true)
      .not('email', 'is', null)
      .returns<{ id: string; email: string; name: string | null }[]>(),
    peersQuery,
  ]);

  const playerName = playerRes.data?.name?.trim() || '(ukjent spiller)';
  const admins = (adminsRes.data ?? []).filter((a) => a.id !== user.id);

  // Peer-varsler hvis peer-godkjenning er på.
  // #543: peersForApproval() håndterer én-flight-regelen: alle andre aktive
  // spillere i ≤4-spill (eller wolf) er attestanter, ellers kun samme flight.
  if (game!.require_peer_approval) {
    const peerIds = peersForApproval(
      peersRes.data ?? [],
      game!.game_mode as GameMode,
      user.id,
    );
    if (peerIds.length > 0) {
      const peerResults = await Promise.allSettled(
        peerIds.map((peerId) =>
          notify({
            userId: peerId,
            kind: 'peer_approval_request',
            payload: {
              game_id: gameId,
              game_name: game!.name,
              submitter_name: playerName,
            },
          }),
        ),
      );
      for (const r of peerResults) {
        if (r.status === 'rejected') {
          console.error(
            '[submitScorecard] peer_approval_request notify failed',
            r.reason,
          );
        }
      }
    }
  }
  if (admins.length > 0) {
    // In-app varsel til admin-ene + mail-gating på shouldAlsoSendMail.
    // Aktive admin-er (last_seen_at < 5 min) får kun in-app; off-app-admin-er
    // får mail som backup. Hvis notify feiler for en admin, defaultes
    // sendMail til false (samme rasjonale som inni notify() ved insert-error
    // — vil ikke maile uten in-app-varsel).
    const adminNotifyResults = await Promise.allSettled(
      admins.map((a) =>
        notify({
          userId: a.id,
          kind: 'scorecard_submitted',
          payload: {
            game_id: gameId,
            game_name: game!.name,
            player_name: playerName,
          },
        }).then((r) => ({ userId: a.id, sendMail: r.shouldAlsoSendMail })),
      ),
    );
    const sendMailByAdminId = new Map<string, boolean>();
    for (const r of adminNotifyResults) {
      if (r.status === 'fulfilled') {
        sendMailByAdminId.set(r.value.userId, r.value.sendMail);
      } else {
        console.error(
          '[submitScorecard] scorecard_submitted notify failed',
          r.reason,
        );
      }
    }

    const mailRecipients = admins.filter(
      (a) => sendMailByAdminId.get(a.id) === true,
    );
    if (mailRecipients.length > 0) {
      const results = await Promise.allSettled(
        mailRecipients.map((a) =>
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
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/games/${gameId}`);
  redirect({ href: `/games/${gameId}?status=submitted` as string, locale });
}
