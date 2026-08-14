'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdmin, requireAdminOrCreator } from '@/lib/admin/auth';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import { endGameCore } from '@/lib/games/endGameCore';
import {
  syncDerivedGamesStatus,
  startDerivedGames,
} from '@/lib/games/syncDerivedGamesStatus';
import { logAdminEvent } from '@/lib/admin/auditLog';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode } from '@/lib/scoring/modes/types';
import { notify } from '@/lib/notifications/notify';
import { expectAffected, NoRowsAffectedError } from '@/lib/supabase/affectedRows';
import {
  notifyPlayersGameStarted,
  notifyPlayersGameReopened,
} from '@/lib/notifications/events';
import { supportsWithdrawal } from '@/lib/scoring';

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
 * Like `loadAdminContext`, but also lets a game's CREATOR run the action on
 * their own game (#429 — roster withdraw + scorecard approval-override). The
 * returned `detailPath` is branched on role so redirects land where the actor
 * came from: admin in Sekretariatet, creator on their `/games/[id]/spillere`
 * cockpit. Admin behavior is byte-identical — `requireAdminOrCreator` returns
 * straight after the same `loadRole` users-read, with no extra query on the
 * admin path.
 *
 * Two name shapes on purpose (#1364): `actorName` is the audit-log string (it
 * must be non-null and stays Norwegian — `logAdminEvent` types it that way),
 * while `name` is the raw profile name for notification payloads, which are
 * read in the RECIPIENT's locale and therefore must not carry Norwegian prose.
 */
async function loadAdminOrCreatorContext(gameId: string) {
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  return {
    supabase,
    user: { id: ctx.userId },
    name: ctx.name?.trim() || null,
    actorName: ctx.name?.trim() || (ctx.isAdmin ? 'Admin' : 'En arrangør'),
    isAdmin: ctx.isAdmin,
    detailPath: ctx.isAdmin
      ? `/admin/games/${gameId}`
      : `/games/${gameId}/spillere`,
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
  const locale = await getLocale();
  const { supabase, user } = await loadAdminContext();
  const detailPath = `/admin/games/${gameId}`;

  const result = await startScheduledGame(supabase, gameId);
  if (!result.ok) {
    if (result.reason === 'pending_players' && result.pendingEmails) {
      const qs = new URLSearchParams({
        error: 'pending_players',
        emails: result.pendingEmails.join(', '),
      });
      redirect({ href: `${detailPath}?${qs.toString()}`, locale });
    }
    if (result.reason === 'rotation_player_count' && result.rotationMode) {
      // #969: carry format + active count so the banner reads
      // «Wolf trenger 3–5 spillere — N påmeldt».
      const qs = new URLSearchParams({
        error: 'rotation_player_count',
        mode: result.rotationMode,
        count: String(result.rotationActiveCount ?? 0),
      });
      redirect({ href: `${detailPath}?${qs.toString()}`, locale });
    }
    redirect({ href: `${detailPath}?error=${result.reason}`, locale });
  }

  // #1441 (D3): the button won the flip → start every derived game (back9
  // singles etc.) too. Best-effort — see startDerivedGames for why this
  // runs the real per-game start flow rather than a raw status patch.
  if (result.ok && result.started) {
    await startDerivedGames(supabase, gameId);
  }

  // #502: the button won the flip → game_started to every active player
  // except the admin who clicked. started=false means a concurrent cron
  // sweep or page visit beat us and already owns the fan-out. Best-effort:
  // the helper swallows notify failures, and a roster/name fetch error just
  // skips the varsel — the start itself already succeeded.
  // (result.ok re-checked because next-intl redirect isn't typed `never`,
  // so TS doesn't narrow the union past the !result.ok guard above.)
  if (result.ok && result.started) {
    const [gameRes, rosterRes] = await Promise.all([
      supabase
        .from('games')
        .select('name, source_game_id')
        .eq('id', gameId)
        .single<{ name: string; source_game_id: string | null }>(),
      supabase
        .from('game_players')
        .select('user_id')
        .eq('game_id', gameId)
        .is('withdrawn_at', null)
        .returns<{ user_id: string }[]>(),
    ]);
    if (gameRes.data && rosterRes.data) {
      await notifyPlayersGameStarted(
        rosterRes.data.filter((p) => p.user_id !== user.id),
        // #1450: a derived match never announces itself — its host owns the
        // cup-start varsel.
        {
          id: gameId,
          name: gameRes.data.name,
          sourceGameId: gameRes.data.source_game_id,
        },
        'startScheduledGameAction',
      );
    }
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  redirect({ href: `${detailPath}?status=started`, locale });
}

/**
 * Admin/creator override: approve a submitted scorecard regardless of flight
 * membership (#429 opens this to the game's creator). Same idempotent guard as
 * the peer flow (only updates rows that are still pending approval). Refuses to
 * run on non-active games. Redirects to the actor's cockpit (Sekretariatet for
 * admin, `/games/[id]/spillere` for creator).
 */
export async function adminApproveScorecard(
  gameId: string,
  playerUserId: string,
) {
  const locale = await getLocale();
  const { supabase, user, name, actorName, detailPath } =
    await loadAdminOrCreatorContext(gameId);

  const { data: game } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single<{ status: 'draft' | 'scheduled' | 'active' | 'finished' }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  if (game!.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }

  // #712: expectAffected turns a silent 0-row UPDATE into an explicit failure.
  // 0 rows here means the scorecard was already approved (idempotent no-op),
  // the player row doesn't exist — or the write was filtered away by RLS. The
  // catch below tells those apart before claiming success (#1595).
  try {
    expectAffected(
      await supabase
        .from('game_players')
        .update({
          approved_at: new Date().toISOString(),
          approved_by_user_id: user.id,
          rejection_reason: null,
        })
        .eq('game_id', gameId)
        .eq('user_id', playerUserId)
        .not('submitted_at', 'is', null)
        .is('approved_at', null)
        .select('user_id'),
      'adminApproveScorecard',
    );
  } catch (err) {
    // NoRowsAffectedError → already approved (idempotent). Plain Error → DB failure.
    // instanceof (not constructor.name) survives prod server minification — the
    // helper restores the prototype chain for exactly this check.
    const isNoRows = err instanceof NoRowsAffectedError;
    if (!isNoRows) {
      console.error('[adminApproveScorecard] approve update failed', err);
      redirect({ href: `${detailPath}?error=db_players`, locale });
    }

    // #1595: "0 rows" has two opposite meanings and the mutation itself cannot
    // tell them apart — PostgREST reports no error either way. Until 0160 a
    // non-playing creator hit an RLS SELECT blind spot, matched 0 rows, and got
    // the success banner while the scorecard stayed unapproved. So re-read the
    // row through the service-role client (RLS-free, so it sees the truth):
    //   • row gone, or approved_at already set → nothing left to do → idempotent
    //     success, exactly as before
    //   • row still pending → the write was blocked, not redundant → say so
    // Keeps I3 (absence of error ≠ success) honest if RLS ever drifts again.
    const admin = getAdminClient();
    const { data: playerRow, error: readError } = await admin
      .from('game_players')
      .select('approved_at')
      .eq('game_id', gameId)
      .eq('user_id', playerUserId)
      .maybeSingle<{ approved_at: string | null }>();

    // A failed re-read is not evidence of success either — treat it as a failure
    // rather than guessing.
    if (readError || playerRow?.approved_at === null) {
      console.error(
        '[adminApproveScorecard] approve matched 0 rows and the scorecard is still pending',
        { gameId, playerUserId, readError },
      );
      redirect({ href: `${detailPath}?error=db_players`, locale });
    }

    // Idempotent: scorecard already approved (or the row is gone) → treat as
    // success without re-notifying.
    revalidateTag(`game-${gameId}`, 'max');
    redirect({ href: `${detailPath}?status=admin_approved#leverte-scorekort`, locale });
  }

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
  // game.name og bruker det RÅ navnet (ikke audit-strengen): mangler det,
  // fyller kortet fallbacken i mottakerens locale (#1364).
  try {
    const { data: gameRow } = await supabase
      .from('games')
      .select('name')
      .eq('id', gameId)
      .single<{ name: string }>();
    await notify({
      userId: playerUserId,
      kind: 'scorecard_approved',
      payload: {
        game_id: gameId,
        game_name: gameRow?.name ?? null,
        approver_name: name,
      },
    });
  } catch (err) {
    console.error(
      '[adminApproveScorecard] scorecard_approved notify failed',
      err,
    );
  }

  revalidateTag(`game-${gameId}`, 'max');
  // #1067: the `#leverte-scorekort` hash is a best-effort UX nicety — Next.js
  // strips URL fragments when replaying a server-action redirect on the
  // client (see ScrollToAnchorOnStatus for the evidence + the client-side
  // fallback that actually performs the scroll). Kept here anyway so a
  // hard/MPA navigation (no-JS, or the RSC redirect falling back to a plain
  // Location header) still lands on the anchor.
  redirect({ href: `${detailPath}?status=admin_approved#leverte-scorekort`, locale });
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
  const locale = await getLocale();
  // #427: a game's creator — not just admins — can finish their own game.
  // requireAdminOrCreator gates on is_admin() OR games.created_by; the status
  // flip below runs on the request-scoped client under the creator-UPDATE RLS
  // policy (migration 0071). Redirects branch on isAdmin so a creator lands on
  // the player game-home, not the admin shell.
  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, gameId);
  const actorName = role.name?.trim() || (role.isAdmin ? 'Admin' : 'Arrangør');
  const detailPath = role.isAdmin
    ? `/admin/games/${gameId}`
    : `/games/${gameId}`;

  // #1501: the finish pipeline lives in `endGameCore` now (so the cup one-tap
  // finish can drive the real per-match finish). This wrapper keeps its exact
  // prior behaviour: same request-scoped client (creator-UPDATE RLS), same
  // per-game reveal notifications (mail + in-app), same redirects — the core
  // returns a result instead of redirecting, and this maps it back 1:1.
  const result = await endGameCore(
    supabase,
    gameId,
    { id: role.userId, name: actorName },
    { allowMissing },
  );

  if (!result.ok) {
    redirect({ href: `${detailPath}?error=${result.reason}`, locale });
  }
  // endGameCore already revalidated `game-${gameId}` + the game paths.
  redirect({ href: `${detailPath}?status=finished`, locale });
}

/**
 * Admin/creator: clear a player's submission so they can edit and re-submit.
 * Wipes submitted_at, any approval, and any prior rejection_reason — the row
 * goes back to a clean in-progress state. Players see the game as active again
 * and can write scores.
 *
 * #1362 opens this to the game's creator (same gate as adminApproveScorecard /
 * adminWithdrawPlayer, #429): admins land back in Sekretariatet, the creator in
 * their own roster cockpit, via `detailPath`. Reopening the creator's OWN
 * approved card also needs the narrow trigger exception from migration 0159 —
 * the guard otherwise blocks every approval-column write on one's own row.
 *
 * No-op safety: only runs when the row currently has submitted_at set.
 */
export async function reopenScorecard(gameId: string, playerUserId: string) {
  const locale = await getLocale();
  const { supabase, user, actorName, detailPath } =
    await loadAdminOrCreatorContext(gameId);

  const { data: game } = await supabase
    .from('games')
    .select('name, status')
    .eq('id', gameId)
    .single<{ name: string; status: GameStatus }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  if (game!.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }

  // #1363: expectAffected turns the silent 0-row UPDATE into an explicit
  // signal. 0 rows here means the scorecard was never submitted (already
  // reopened, idempotent no-op) or the player row doesn't exist. Same
  // precedent as adminApproveScorecard: redirect to ?status=scorecard_reopened
  // rather than an error, but WITHOUT firing the audit log and the varsel for
  // a write that never happened.
  try {
    expectAffected(
      await supabase
        .from('game_players')
        .update({
          submitted_at: null,
          approved_at: null,
          approved_by_user_id: null,
          rejection_reason: null,
        })
        .eq('game_id', gameId)
        .eq('user_id', playerUserId)
        .not('submitted_at', 'is', null)
        .select('user_id'),
      'reopenScorecard',
    );
  } catch (err) {
    // NoRowsAffectedError → nothing to reopen (idempotent). Plain Error → DB failure.
    // instanceof (not constructor.name) survives prod server minification — the
    // helper restores the prototype chain for exactly this check.
    if (!(err instanceof NoRowsAffectedError)) {
      console.error('[reopenScorecard] reopen update failed', err);
      redirect({ href: `${detailPath}?error=db_players`, locale });
    }
    revalidateTag(`game-${gameId}`, 'max');
    redirect({ href: `${detailPath}?status=scorecard_reopened`, locale });
  }

  await logAdminEvent({
    actorId: user.id,
    actorName,
    eventType: 'scorecard.reopened',
    targetType: 'scorecard',
    targetId: gameId,
    payload: { gameId, playerUserId },
  });

  // #1363: best-effort varsel til spilleren som eier kortet. Uten det tror hen
  // fortsatt at kortet er levert og godkjent, mens avslutningen blokkerer på
  // not_all_submitted. Feil her endrer ikke utfallet av gjenåpningen — try/catch
  // slutter FØR redirecten under, som kaster by design.
  try {
    await notify({
      userId: playerUserId,
      kind: 'scorecard_reopened',
      payload: {
        game_id: gameId,
        game_name: game!.name,
        actor_name: actorName,
      },
    });
  } catch (err) {
    console.error('[reopenScorecard] scorecard_reopened notify failed', err);
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  redirect({ href: `${detailPath}?status=scorecard_reopened`, locale });
}

/**
 * Admin/creator: mark a player as withdrawn (WD) in an active game (#386;
 * #429 opens this to the game's creator).
 *
 * The player's existing scores are preserved in DB but excluded from the
 * leaderboard. Only supported for `supportsWithdrawal` modes. Redirects to
 * the actor's cockpit on success or on any validation failure.
 */
export async function adminWithdrawPlayer(gameId: string, userId: string) {
  const locale = await getLocale();
  const { supabase, user, actorName, detailPath } =
    await loadAdminOrCreatorContext(gameId);

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, game_mode')
    .eq('id', gameId)
    .single<{ id: string; name: string; status: GameStatus; game_mode: GameMode }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  if (game!.status !== 'active') redirect({ href: `${detailPath}?error=not_active`, locale });
  if (!supportsWithdrawal(game!.game_mode)) redirect({ href: detailPath, locale });

  const { error } = await supabase
    .from('game_players')
    .update({
      withdrawn_at: new Date().toISOString(),
      withdrawn_by_user_id: user.id,
    })
    .eq('game_id', gameId)
    .eq('user_id', userId);
  if (error) {
    console.error('[adminWithdrawPlayer] withdraw update failed', error);
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

  await logAdminEvent({
    actorId: user.id,
    actorName,
    eventType: 'game.player_withdrawn',
    targetType: 'game',
    targetId: gameId,
    payload: { gameId, userId },
  });

  // No in-app notification yet: there is no «du ble trukket»-kind, and reusing
  // an unrelated one (e.g. scorecard_approved) would mislead the player. A
  // dedicated WD notification is deferred — the audit-log entry above is the
  // record for now.

  revalidateTag(`game-${gameId}`, 'max');
  redirect({ href: `${detailPath}?status=player_withdrawn`, locale });
}

/**
 * Admin/creator: undo a withdrawal — nulls `withdrawn_at` and
 * `withdrawn_by_user_id` so the player is re-included in readiness counts and
 * the leaderboard (#386; #429 opens this to the game's creator). Only while
 * the game is still active.
 */
export async function adminUndoWithdraw(gameId: string, userId: string) {
  const locale = await getLocale();
  const { supabase, user, actorName, detailPath } =
    await loadAdminOrCreatorContext(gameId);

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status, game_mode')
    .eq('id', gameId)
    .single<{ id: string; name: string; status: GameStatus; game_mode: GameMode }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  if (game!.status !== 'active') redirect({ href: `${detailPath}?error=not_active`, locale });
  if (!supportsWithdrawal(game!.game_mode)) redirect({ href: detailPath, locale });

  const { error } = await supabase
    .from('game_players')
    .update({
      withdrawn_at: null,
      withdrawn_by_user_id: null,
    })
    .eq('game_id', gameId)
    .eq('user_id', userId);
  if (error) {
    console.error('[adminUndoWithdraw] undo-withdraw update failed', error);
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

  await logAdminEvent({
    actorId: user.id,
    actorName,
    eventType: 'game.player_reinstated',
    targetType: 'game',
    targetId: gameId,
    payload: { gameId, userId },
  });

  revalidateTag(`game-${gameId}`, 'max');
  redirect({ href: `${detailPath}?status=player_reinstated`, locale });
}

/**
 * Admin: flip a finished game back to active. Clears ended_at so the
 * leaderboard hides again and players can edit scores. Useful when the
 * round was ended prematurely or a result needs correction.
 */
export async function reopenGame(gameId: string) {
  const locale = await getLocale();
  const { supabase, user, actorName } = await loadAdminContext();
  const detailPath = `/admin/games/${gameId}`;

  const { data: game } = await supabase
    .from('games')
    .select('id, name, status')
    .eq('id', gameId)
    .single<{ id: string; name: string; status: GameStatus }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  if (game!.status !== 'finished') {
    redirect({ href: `${detailPath}?error=not_finished`, locale });
  }

  const { error } = await supabase
    .from('games')
    // #1008: nuller AI-rundereferatet — en re-finish kan skippe regenerering
    // (manglende ANTHROPIC_API_KEY, tynn data), så et gammelt referat med
    // tall fra FØR reopen må ikke overleve og villede spillerne.
    .update({ status: 'active', ended_at: null, round_report: null })
    .eq('id', gameId);
  if (error) {
    console.error('[reopenGame] status flip to active failed', error);
    redirect({ href: `${detailPath}?error=db_game`, locale });
  }

  // #1441 (D3): reopening the host reopens every derived game too — same
  // raw patch (no per-player computation needed, unlike a fresh start).
  // Best-effort, see syncDerivedGamesStatus.
  await syncDerivedGamesStatus(supabase, gameId, {
    status: 'active',
    ended_at: null,
    round_report: null,
  });

  await logAdminEvent({
    actorId: user.id,
    actorName,
    eventType: 'game.reopened',
    targetType: 'game',
    targetId: gameId,
    payload: { gameName: game!.name },
  });

  // #1363: fan-out til alle aktive deltakere — resultatlista forsvinner for
  // ALLE ved en gjenåpning, ikke bare for dem som hadde levert. Trukkede
  // spillere (withdrawn_at satt) og aktøren selv står utenfor. Best-effort:
  // helperen svelger notify-feil, og et roster-oppslag som feiler dropper bare
  // varselet — gjenåpningen har allerede skjedd.
  const { data: roster, error: rosterError } = await supabase
    .from('game_players')
    .select('user_id')
    .eq('game_id', gameId)
    .is('withdrawn_at', null)
    .returns<{ user_id: string }[]>();
  if (rosterError) {
    console.error('[reopenGame] roster lookup for varsel failed', rosterError);
  } else {
    await notifyPlayersGameReopened(
      (roster ?? []).filter((p) => p.user_id !== user.id),
      { id: gameId, name: game!.name, actorName },
      'reopenGame',
    );
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  revalidatePath(`/games/${gameId}/leaderboard`);
  redirect({ href: `${detailPath}?status=game_reopened`, locale });
}

