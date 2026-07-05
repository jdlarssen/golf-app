'use server';

import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin, requireAdminOrCreator } from '@/lib/admin/auth';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import { sendGameFinishedNotification } from '@/lib/mail/gameFinishedNotification';
import { buildGameFinishedRecipients } from '@/lib/mail/gameFinishedRecipients';
import { persistResultSummaries } from '@/lib/games/persistResultSummaries';
import { persistScoreDifferentials } from '@/lib/games/persistScoreDifferentials';
import { notifyAchievementUnlocks } from '@/lib/games/notifyAchievementUnlocks';
import { generateAndPersistRoundReport } from '@/lib/games/generateRoundReport';
import { firstName } from '@/lib/firstName';
import { logAdminEvent } from '@/lib/admin/auditLog';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import { notify } from '@/lib/notifications/notify';
import { expectAffected, NoRowsAffectedError } from '@/lib/supabase/affectedRows';
import {
  notifyPlayersGameFinished,
  notifyPlayersGameStarted,
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
 */
async function loadAdminOrCreatorContext(gameId: string) {
  const supabase = await getServerClient();
  const ctx = await requireAdminOrCreator(supabase, gameId);
  return {
    supabase,
    user: { id: ctx.userId },
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
        .select('name')
        .eq('id', gameId)
        .single<{ name: string }>(),
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
        { id: gameId, name: gameRes.data.name },
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
  const { supabase, user, actorName, detailPath } =
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
  // 0 rows here means the scorecard was already approved (idempotent no-op) or
  // the player row doesn't exist. Either way there's nothing to approve, so
  // we redirect to ?status=admin_approved (idempotent) rather than firing the
  // audit log and notification for a write that never happened.
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
    // Idempotent: scorecard already approved → treat as success without re-notifying.
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
  const user = { id: role.userId };
  const actorName = role.name?.trim() || (role.isAdmin ? 'Admin' : 'Arrangør');
  const detailPath = role.isAdmin
    ? `/admin/games/${gameId}`
    : `/games/${gameId}`;

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
    redirect({ href: `${detailPath}?error=not_active`, locale });
  }

  // Verify every player has submitted; if require_peer_approval, every
  // submission must also be approved. Also collect user_id + email + name
  // her so we can fire både in-app `game_finished`-varsler (user_id) og
  // «Resultatet er klart»-mail (email/name) etter status-flippen uten
  // ekstra DB-runde.
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
    // Withdrawn (WD, #386): out of the ranking entirely — never counts as a
    // missing submission or a pending approval, so they never block the end.
    if (p.withdrawn_at) continue;
    if (!p.submitted_at) {
      // No-show: block by default, but let «avslutt likevel» skip past them.
      // submitted_at stays null — they show as «ikke levert», never a false
      // levering; their registered scores still count in the leaderboard.
      if (!allowMissing) {
        redirect({ href: `${detailPath}?error=not_all_submitted`, locale });
      }
      continue;
    }
    if (game!.require_peer_approval && !p.approved_at) {
      redirect({ href: `${detailPath}?error=not_all_approved`, locale });
    }
  }

  const { error } = await supabase
    .from('games')
    .update({ status: 'finished', ended_at: new Date().toISOString() })
    .eq('id', gameId);

  if (error) {
    console.error('[endGame] finish status update failed', error);
    redirect({ href: `${detailPath}?error=db_finish`, locale });
  }

  // #572: beregn og lagre per-spiller-resultatet for avsluttede-spill-kortene.
  // Best-effort — feiler aldri ut av avslutningen (egen try/catch internt).
  await persistResultSummaries({
    id: gameId,
    game_mode: game!.game_mode,
    mode_config: game!.mode_config,
    course_id: game!.course_id,
  });

  // #941: fryser WHS score-differensial per spiller. Best-effort — se
  // persistScoreDifferentials for fullstendig begrunnelse.
  await persistScoreDifferentials(gameId);

  // #947: best-effort bragd-varsel til spillere som låste opp et øyeblikk
  // (hole-in-one/eagle/turkey/snowman) i runden. Feiler aldri ut avslutningen.
  await notifyAchievementUnlocks(gameId);

  // #1008: best-effort AI-rundereferat («Pressetribunen»). Må kjøre FØR
  // mail-blasten lenger ned slik at teksten kan bli med i «Resultatet er
  // klart»-mailen — feiler den (manglende nøkkel, tynn data, SDK-feil)
  // fortsetter avslutningen som i dag, bare uten referat.
  const { report: roundReport } = await generateAndPersistRoundReport(gameId);

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
          locale: r.locale,
          roundReport,
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
  redirect({ href: `${detailPath}?status=finished`, locale });
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
  const locale = await getLocale();
  const { supabase, user, actorName } = await loadAdminContext();
  const detailPath = `/admin/games/${gameId}`;

  const { data: game } = await supabase
    .from('games')
    .select('status')
    .eq('id', gameId)
    .single<{ status: GameStatus }>();
  if (!game) redirect({ href: `${detailPath}?error=not_found`, locale });
  if (game!.status !== 'active') {
    redirect({ href: `${detailPath}?error=not_active`, locale });
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
  if (error) {
    console.error('[reopenScorecard] reopen update failed', error);
    redirect({ href: `${detailPath}?error=db_players`, locale });
  }

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
  redirect({ href: `${detailPath}?status=game_reopened`, locale });
}

