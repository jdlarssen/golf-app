import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { persistResultSummaries } from '@/lib/games/persistResultSummaries';
import { persistScoreDifferentials } from '@/lib/games/persistScoreDifferentials';
import { notifyAchievementUnlocks } from '@/lib/games/notifyAchievementUnlocks';
import { generateAndPersistRoundReport } from '@/lib/games/generateRoundReport';
import { finishDerivedGames } from '@/lib/games/syncDerivedGamesStatus';
import { sendGameFinishedNotification } from '@/lib/mail/gameFinishedNotification';
import { buildGameFinishedRecipients } from '@/lib/mail/gameFinishedRecipients';
import { notifyPlayersGameFinished } from '@/lib/notifications/events';
import { logAdminEvent } from '@/lib/admin/auditLog';
import { firstName } from '@/lib/firstName';
import type { EndGameActor } from '@/lib/games/endGameCore';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';

/**
 * The server-owned TAIL of a game finish (#1856, N6c) — everything that has to
 * happen after `games.status` flips to `'finished'`, lifted verbatim out of
 * `endGameCore` so it has ONE home and TWO entry points.
 *
 * WHY IT MOVED. The phone can flip a game to finished all by itself (creator
 * RLS, migration 0071), but it can never run this tail: `score_differential` is
 * trigger-locked to the service role (0117), four of the steps reach for
 * `getAdminClient()` themselves, and the rest need Resend, the Anthropic SDK and
 * the Next runtime. Mirroring any of that into the app was rejected in the
 * contract. So the app finishes the game and leaves `finish_pipeline_at` null;
 * the sweep cron finds it and calls in here. Web keeps calling it synchronously
 * from `endGameCore`, unchanged.
 *
 * TWO INVARIANTS THIS FILE EXISTS TO PROTECT — both are load-bearing, both are
 * easy to lose in a move, and both have tests:
 *
 *  1. THE CLIENT SPLIT IS NOT AN ACCIDENT. `finishDerivedGames` and
 *     `buildGameFinishedRecipients` run on the CALLER's client; the other four
 *     steps take ids/objects and open their own admin client. The web finish
 *     passes the request-scoped creator client (0071 RLS), the cup finish passes
 *     the admin client because a klubb-styrer is not the games' creator
 *     (AGENTS.md trap #3 — the authz difference is deliberate, gated upstream by
 *     `requireAdminOrClubAdminOfCup`). Collapsing these into "one client" would
 *     silently widen or break one of the two paths.
 *
 *  2. `Promise.allSettled` AROUND THE MAIL BLAST LIVES HERE, NOT IN THE MAILER.
 *     `sendGameFinishedNotification` throws on failure. The best-effort promise
 *     is this call site's; move the call without it and finishing a round starts
 *     failing whenever Resend hiccups.
 *
 * CLAIM FIRST, WORK SECOND. The marker is won at the very top (`UPDATE … SET
 * finish_pipeline_at = now() WHERE status = 'finished' AND finish_pipeline_at
 * IS NULL … RETURNING id`, the same win-the-row shape as
 * `maybeNotifyAutoStartBlocked`, status predicate included), NOT written at
 * the end. That is a deliberate at-most-once choice over at-least-once, because
 * the expensive steps are the non-idempotent ones: `notifyAchievementUnlocks`
 * does a bare INSERT with no unique index (a second pass = duplicate varsler in
 * everyone's feed), `generateAndPersistRoundReport` bills an Anthropic call per
 * pass, and the «Resultatet er klart»-mail is re-sendable to real inboxes. A
 * crash between the claim and the last step therefore costs a missing tail on
 * one game — visible, fixable, silent to players — while the alternative costs
 * duplicate mail and double billing on every retry. The claim MUST go through
 * the service role: `guard_games_finish_pipeline_at` (0169) raises 42501 for any
 * non-admin authenticated writer, and the web path admits a non-admin creator.
 */

/** The `games` fields the tail reads. Same shape `endGameCore` already selects. */
export type FinishPipelineGame = {
  id: string;
  name: string;
  course_id: string;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  hole_segment: HoleSegment;
};

export type RunFinishPipelineInput = {
  game: FinishPipelineGame;
  /**
   * The FULL roster, unfiltered — withdrawn players included, exactly as
   * `endGameCore` reads it. `notifyPlayersGameFinished` decides who gets a
   * varsel; filtering here would silently change who is told the round is over.
   */
  players: Array<{ user_id: string }>;
  /** The `ended_at` stamped on the host game, reused for its derived games. */
  endedAt: string;
  /** Audit-log actor. The sweep resolves it from `games.created_by`. */
  actor: EndGameActor;
  /**
   * Cup (#1501): hold back the two per-match reveal signals (in-app
   * `game_finished` + «Resultatet er klart»-mail). Every persistence step still
   * runs. Cup-ness is ALWAYS caller-supplied — never derived from
   * `tournament_id` in here, because the same game row is finished by two
   * callers with two different notification contracts.
   */
  suppressPerGameNotifications?: boolean;
  /** Extra fields merged into the `game.finished` audit payload. */
  auditExtras?: Record<string, unknown>;
  /** Log prefix. `'endGame'` / `'endGameWithSideWinners'` from the web,
   *  `'finishPipeline'` from the sweep. */
  logContext?: string;
};

export type RunFinishPipelineResult = {
  /**
   * `false` means the marker was already claimed — another runner owns this
   * finish and nothing was done here. It is a normal outcome, not a failure:
   * the sweep and a synchronous web finish can legitimately race.
   */
  ran: boolean;
};

/**
 * Win the `finish_pipeline_at` row for `gameId`. Returns true only for the
 * caller that flipped it from null ON A GAME THAT IS STILL FINISHED.
 *
 * The `status = 'finished'` predicate is part of the claim, not a separate
 * check, for the same reason `maybeNotifyAutoStartBlocked` puts
 * `status = 'scheduled'` inside its win-the-row UPDATE: any status read done
 * BEFORE the claim is a different transaction. The sweep reads its candidates,
 * an admin reopens the game a moment later, and a pre-claim check has already
 * passed — without this predicate the claim then succeeds and the tail mails
 * results for a round that is live again, burning the marker on the way out
 * (and `reopenGame` has already cleared it once, so nothing clears it a second
 * time). With the predicate the claim simply finds 0 rows and the tail returns.
 *
 * Every caller already guarantees `finished` at this point, which is what makes
 * the predicate free: `endGameCore` calls in only after its own optimistic
 * `active → finished` flip WON, and `runFinishPipelineForGame` refuses anything
 * whose status is not `finished`. The predicate is here for the window between
 * that guarantee and this UPDATE.
 *
 * Best-effort in the pessimistic direction: any error (including a missing
 * service-role key) is logged and reported as "not claimed", so a broken
 * environment skips the tail instead of running it twice. The tail could not
 * have completed without that key anyway — every step below opens its own
 * admin client.
 */
async function claimFinishPipeline(
  gameId: string,
  logContext: string,
): Promise<boolean> {
  try {
    const admin = getAdminClient();
    const { data: claimed, error } = await admin
      .from('games')
      .update({ finish_pipeline_at: new Date().toISOString() })
      .eq('id', gameId)
      .eq('status', 'finished')
      .is('finish_pipeline_at', null)
      .select('id')
      .maybeSingle<{ id: string }>();

    if (error) {
      console.error(`[${logContext}] finish-pipeline claim failed`, error);
      return false;
    }
    return claimed != null;
  } catch (e) {
    console.error(`[${logContext}] finish-pipeline claim threw`, e);
    return false;
  }
}

/**
 * Run the finish tail exactly once for a game whose status is already
 * `'finished'`.
 *
 * Every step below is best-effort by its own internal contract (they log and
 * swallow), which is why there is no result to collect: the game is finished
 * either way, and this function's only real decision is whether it owns the run.
 */
export async function runFinishPipeline(
  supabase: SupabaseClient<Database>,
  input: RunFinishPipelineInput,
): Promise<RunFinishPipelineResult> {
  const {
    game,
    players,
    endedAt,
    actor,
    suppressPerGameNotifications = false,
    auditExtras,
    logContext = 'finishPipeline',
  } = input;

  // Claim before any work — see the file header. 0 rows back = someone else
  // owns this finish.
  if (!(await claimFinishPipeline(game.id, logContext))) {
    return { ran: false };
  }

  // #1441 (D3): fan the finish out to every derived game (back9 singles
  // etc.) in the same operation, including their own result summaries +
  // score differentials. Best-effort — 0 derived games (the vast majority
  // of finishes) is a cheap no-op; a real failure is logged but never
  // blocks the host's own finish, which has already committed.
  await finishDerivedGames(supabase, game.id, endedAt);

  // #572: beregn og lagre per-spiller-resultatet for avsluttede-spill-kortene.
  // Best-effort — feiler aldri ut av avslutningen (egen try/catch internt).
  // #1441: hole_segment sendes med slik at et segment-HOST-spill (front9/
  // back9) får sitt eget resultat regnet over sine 9 hull, ikke alle 18.
  await persistResultSummaries({
    id: game.id,
    game_mode: game.game_mode,
    mode_config: game.mode_config,
    course_id: game.course_id,
    hole_segment: game.hole_segment,
  });

  // #941: fryser WHS score-differensial per spiller. Best-effort — se
  // persistScoreDifferentials for fullstendig begrunnelse.
  await persistScoreDifferentials(game.id);

  // #947: best-effort bragd-varsel til spillere som låste opp et øyeblikk
  // (hole-in-one/eagle/turkey/snowman) i runden. Feiler aldri ut avslutningen.
  await notifyAchievementUnlocks(game.id);

  // #1008: best-effort AI-rundereferat («Pressetribunen»). Må kjøre FØR
  // mail-blasten lenger ned slik at teksten kan bli med i «Resultatet er
  // klart»-mailen — feiler den (manglende nøkkel, tynn data, SDK-feil)
  // fortsetter avslutningen som i dag, bare uten referat.
  const { report: roundReport } = await generateAndPersistRoundReport(game.id);

  await logAdminEvent({
    actorId: actor.id,
    actorName: actor.name,
    eventType: 'game.finished',
    targetType: 'game',
    targetId: game.id,
    // #1488 (K1): `auditExtras` carries the side-winners caller's
    // `{ sideTournament: true, sideWinners }` so the audit payload is
    // byte-identical to the old inline action.
    payload: { gameName: game.name, ...auditExtras },
  });

  // #1501: cup-avslutningen undertrykker de to reveal-signalene per kamp —
  // cup-mailen er reveal-signalet der. Vanlig enkeltspill-avslutning kjører
  // begge som før.
  if (!suppressPerGameNotifications) {
    // Best-effort in-app `game_finished`-varsel til hver deltaker. Loopen fyres
    // parallelt med mail-blasten lenger ned. Phase 4-gating: aktive spillere
    // (last_seen_at < 5 min) får kun in-app; off-app-spillere får mail som
    // backup. Notify-feil → ikke send mail (samme rasjonale som inni notify()).
    const sendMailByUserId = await notifyPlayersGameFinished(
      players,
      { id: game.id, name: game.name },
      logContext,
    );

    // Best-effort: send "Resultatet er klart"-mail kun til off-app-spillere.
    // Failures er loggført men aborter aldri actionen — leaderboardet er
    // tilgjengelig in-app uansett, og admin kan re-trigge ved behov (ingen
    // resend-flyt finnes ennå, men DB er source of truth).
    //
    // Mode-aware payload: for stableford regner helperen ut leaderboard og
    // legger per-spiller rank/poeng på hver mottaker; for best-ball returnerer
    // den kun userId/email/name (mailen bruker da default nøytral copy).
    const recipients = await buildGameFinishedRecipients(supabase, game.id, {
      course_id: game.course_id,
      game_mode: game.game_mode,
      mode_config: game.mode_config,
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
            gameName: game.name,
            gameId: game.id,
            mode: r.mode,
            locale: r.locale,
            roundReport,
          }),
        ),
      );
      for (const r of results) {
        if (r.status === 'rejected') {
          console.error(`[${logContext}] game-finished mail failed`, r.reason);
        }
      }
    }
  }

  return { ran: true };
}

/**
 * Sweep entry point: load everything `runFinishPipeline` needs for `gameId`
 * straight from the DB, then run it.
 *
 * Exists so the cron sweep never has to re-derive the game/roster shape the tail
 * depends on (bug-prevention trap #4 — one rule, one home). Refuses, with a log
 * line and `ran: false`, on anything it cannot attribute or that is not actually
 * finished; a refusal leaves `finish_pipeline_at` null, so the next sweep sees
 * the same game again rather than the tail being lost silently.
 *
 * `created_by` is the audit actor: an app-finished game was finished by its
 * creator (that is the only RLS path the phone has), so attributing the tail to
 * them matches what the web writes for the same action.
 *
 * Pass the SERVICE-ROLE client. The two client-taking steps inside read across
 * the whole roster and every derived game, which no request-scoped client is
 * guaranteed to see.
 */
export async function runFinishPipelineForGame(
  supabase: SupabaseClient<Database>,
  gameId: string,
  options: {
    suppressPerGameNotifications?: boolean;
    logContext?: string;
  } = {},
): Promise<RunFinishPipelineResult> {
  const { logContext = 'finishPipeline' } = options;

  const { data: game, error: gameErr } = await supabase
    .from('games')
    .select(
      'id, name, status, ended_at, created_by, course_id, game_mode, mode_config, hole_segment, users!games_created_by_fkey(name)',
    )
    .eq('id', gameId)
    .maybeSingle<{
      id: string;
      name: string;
      status: string;
      ended_at: string | null;
      created_by: string | null;
      course_id: string;
      game_mode: GameMode;
      mode_config: GameModeConfig;
      hole_segment: HoleSegment;
      users: { name: string | null } | null;
    }>();

  if (gameErr || !game) {
    console.error(`[${logContext}] game ${gameId} not readable`, gameErr);
    return { ran: false };
  }
  if (game.status !== 'finished') {
    // The sweep's own WHERE already filters on this; a mismatch means the row
    // changed under us (reopened), and the tail must not run on a live game.
    console.log(
      `[${logContext}] game ${gameId} is ${game.status}, not finished — skipping`,
    );
    return { ran: false };
  }
  if (!game.created_by) {
    console.error(
      `[${logContext}] game ${gameId} has no created_by — no actor to attribute the finish to`,
    );
    return { ran: false };
  }

  const { data: players } = await supabase
    .from('game_players')
    .select('user_id')
    .eq('game_id', gameId)
    .returns<{ user_id: string }[]>();

  return runFinishPipeline(supabase, {
    game: {
      id: game.id,
      name: game.name,
      course_id: game.course_id,
      game_mode: game.game_mode,
      mode_config: game.mode_config,
      hole_segment: game.hole_segment,
    },
    players: players ?? [],
    // A finished game without `ended_at` is possible on old/service-role-written
    // rows; the derived-game stamp then uses now() rather than writing null.
    endedAt: game.ended_at ?? new Date().toISOString(),
    actor: { id: game.created_by, name: game.users?.name?.trim() || 'Arrangør' },
    suppressPerGameNotifications: options.suppressPerGameNotifications,
    logContext,
  });
}
