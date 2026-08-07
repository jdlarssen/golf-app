'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { sendScorecardSubmittedNotification } from '@/lib/mail/scorecardSubmittedNotification';
import { firstName } from '@/lib/firstName';
import { notify } from '@/lib/notifications/notify';
import { peersForApproval } from '@/lib/games/flightScope';
import { findSegmentSibling } from '@/lib/games/segmentSibling';
import {
  isScrambleFamily,
  isAlternateShotMatchplay,
  type GameMode,
} from '@/lib/scoring/modes/types';

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
  // #1466: `hole_segment` + `tournament_id` + `source_game_id` drive the
  // one-delivery cascade below — a back9 split-cup host delivers its front9
  // sibling in the same call.
  const { data: game } = await supabase
    .from('games')
    .select(
      'name, status, require_peer_approval, game_mode, hole_segment, tournament_id, source_game_id',
    )
    .eq('id', gameId)
    .single<{
      name: string;
      status: 'draft' | 'scheduled' | 'active' | 'finished';
      require_peer_approval: boolean;
      game_mode: string;
      hole_segment: 'full' | 'front9' | 'back9';
      tournament_id: string | null;
      source_game_id: string | null;
    }>();

  if (!game || game.status !== 'active') {
    redirect({ href: `/games/${gameId}/submit?error=not_active` as string, locale });
  }

  // Withdrawn (#387): a trukket spiller can't submit. The submit page redirects
  // them away, but a direct POST to this action must also be refused — defense-
  // in-depth. Bounce to game-home, which renders the «Du har trukket deg»-banner.
  const { data: meRow } = await supabase
    .from('game_players')
    .select('withdrawn_at, submitted_at, team_number')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .maybeSingle<{
      withdrawn_at: string | null;
      submitted_at: string | null;
      team_number: number | null;
    }>();

  if (meRow?.withdrawn_at) {
    redirect({ href: `/games/${gameId}` as string, locale });
  }

  // #1453: har innsenderen alt levert er hele kallet idempotent — hopp over
  // oppdatering og side-effekter (samme UX som 0-rads-grenen under). Uten
  // denne kunne et re-klikk i lag-modusene re-fyre varsler for en lagkamerat
  // som ennå ikke sto som levert.
  if (meRow?.submitted_at) {
    revalidateTag(`game-${gameId}`, 'max');
    revalidatePath(`/games/${gameId}`);
    redirect({ href: `/games/${gameId}?status=submitted` as string, locale });
  }

  // #1453: én-ball-lagformat (scramble-familien + alternate-shot-matchplay) —
  // laget fører én felles ball, så én levering markerer HELE lagets aktive,
  // uleverte rader. Cascaden går via admin-client: RLS-flightmate-policyen
  // (can_score_for) dekker ikke alle flight-konfigurasjoner, og authz er alt
  // verifisert her (innsenderen er aktiv spiller i spillet). Patsome er
  // bevisst utenfor — bytter mellom individuell og lag-føring midtveis.
  const mode = game!.game_mode as GameMode;
  const teamSubmit =
    (isScrambleFamily(mode) || isAlternateShotMatchplay(mode)) &&
    meRow?.team_number != null;
  const submitPatch = {
    submitted_at: new Date().toISOString(),
    // A previous rejection clears once the player re-submits.
    rejection_reason: null,
  };
  const { data: updated, error } = teamSubmit
    ? await getAdminClient()
        .from('game_players')
        .update(submitPatch)
        .eq('game_id', gameId)
        .eq('team_number', meRow!.team_number!)
        .is('withdrawn_at', null)
        .is('submitted_at', null)
        .select('user_id')
    : await supabase
        .from('game_players')
        .update(submitPatch)
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

  // #1466: one delivery covers the whole split cup round. A back9 host's
  // submit ALSO marks the submitter's front9 sibling delivered, so the player
  // never delivers twice. Direction is back9→front9 only (a manual front9
  // deliver via the escape hatch never cascades). Runs AFTER the primary
  // update hit >0 rows and BEFORE the side-effects, so notifications fire once
  // for the back9 host and the front9 marking stays silent (the admin sees
  // both cards in the approve queue regardless).
  if (
    game!.hole_segment === 'back9' &&
    game!.tournament_id != null &&
    game!.source_game_id == null
  ) {
    const updatedUserIds = (updated ?? []).map((r) => r.user_id);
    try {
      const sibling = await findSegmentSibling(user.id, {
        holeSegment: 'back9',
        sourceGameId: null,
        tournamentId: game!.tournament_id,
      });
      // Only cascade to an undelivered sibling. `mySubmittedAt != null` means
      // it is already delivered (a teammate's cascade won a race, or the
      // front9 was delivered manually) → nothing to do.
      if (sibling && sibling.mySubmittedAt == null) {
        // Team-wide when the front9 sibling is a one-ball team format
        // (greensome IS — #1453); own-row otherwise. Same guarded, admin-client
        // form as the primary update above.
        const siblingTeamSubmit =
          (isScrambleFamily(sibling.gameMode) ||
            isAlternateShotMatchplay(sibling.gameMode)) &&
          sibling.myTeamNumber != null;
        const { error: siblingError } = siblingTeamSubmit
          ? await getAdminClient()
              .from('game_players')
              .update(submitPatch)
              .eq('game_id', sibling.gameId)
              .eq('team_number', sibling.myTeamNumber!)
              .is('withdrawn_at', null)
              .is('submitted_at', null)
              .select('user_id')
          : await getAdminClient()
              .from('game_players')
              .update(submitPatch)
              .eq('game_id', sibling.gameId)
              .eq('user_id', user.id)
              .is('submitted_at', null)
              .select('user_id');
        // 0 rows = the sibling was already delivered between the lookup and the
        // update (race) → tolerated no-op, continue. Any DB error is handled in
        // the catch below (compensated).
        if (siblingError) throw siblingError;

        // Both games are now delivered — revalidate the front9 host too.
        revalidateTag(`game-${sibling.gameId}`, 'max');
        revalidatePath(`/games/${sibling.gameId}`);
      }
    } catch (err) {
      // #1466 trap #5: a half-delivered pair (back9 marked, front9 not) hides
      // the front9 deliver-CTA in broModus — a blind gate. Revert the back9
      // rows just set and fail loudly rather than leave the pair half-done.
      // (A previously-cleared rejection_reason on the reverted rows is an
      // accepted cosmetic loss.)
      console.error(
        '[submitScorecard] front9 sibling cascade failed — reverting back9',
        err,
      );
      if (updatedUserIds.length > 0) {
        await getAdminClient()
          .from('game_players')
          .update({ submitted_at: null })
          .eq('game_id', gameId)
          .in('user_id', updatedUserIds);
      }
      redirect({ href: `/games/${gameId}/submit?error=db` as string, locale });
    }
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
      .select('id, email, name, locale')
      .eq('is_admin', true)
      .not('email', 'is', null)
      .returns<{ id: string; email: string; name: string | null; locale: string | null }[]>(),
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
            locale: a.locale,
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
