import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { revalidateTag } from 'next/cache';
import { revalidatePath } from '@/lib/i18n/revalidateLocalePath';
import { runFinishPipeline } from '@/lib/games/runFinishPipeline';
import type { GameStatus } from '@/lib/games/status';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { HoleSegment } from '@/lib/scoring';

/**
 * Actor context the finish pipeline needs for audit-logging. `name` is the
 * caller-resolved display name (already trimmed with its role-fallback applied).
 */
export type EndGameActor = { id: string; name: string };

/**
 * One LD/CTP side-tournament winner to persist as part of the finish (#1488,
 * K1). Upserted on the `(game_id, category, position)` PK, so a re-run
 * overwrites the previous pick. `winner_user_id` is `null` for a slot the
 * organiser explicitly left empty («ingen vinner»).
 */
export type EndGameSideWinner = {
  category: 'longest_drive' | 'closest_to_pin';
  position: 1 | 2;
  winner_user_id: string | null;
};

export type EndGameCoreOptions = {
  /**
   * «Avslutt likevel»-rømningen (#375): players who never submitted are
   * skipped instead of blocking the finish. Their `submitted_at` stays null.
   * The peer-approval gate is NEVER relaxed by this (that lock is #360's).
   */
  allowMissing?: boolean;
  /**
   * When true, the per-game reveal signals — the in-app `game_finished`
   * notification and the «Resultatet er klart»-mail — are suppressed (#1501).
   * The cup-avslutning fires ONE `cupFinishedNotification` as the reveal
   * signal instead, so each finished match staying silent avoids N per-match
   * mails/varsler. All data-persistence steps (result summaries, differentials,
   * achievements, round report, derived-game finish) still run — only the two
   * result-reveal notifications are held back.
   */
  suppressPerGameNotifications?: boolean;
  /**
   * Side-tournament (LD/CTP) winners to upsert (#1488, K1). Persisted AFTER
   * player validation and BEFORE the status flip, so a partial failure leaves
   * the game `active` and returns reason `'db_winners'` — the organiser can
   * retry. Idempotent on the `(game_id, category, position)` PK. Empty/omitted
   * → the winner step is skipped entirely (ordinary single-game finish).
   */
  sideWinners?: EndGameSideWinner[];
  /**
   * Extra fields merged into the `game.finished` audit-log payload (#1488, K1).
   * The side-winners caller passes `{ sideTournament: true, sideWinners }` so
   * the audit trail matches the old inline action byte-for-byte.
   */
  auditExtras?: Record<string, unknown>;
  /**
   * Log-prefix + notify context (#1488, K3). Default `'endGame'`; the
   * side-winners wrapper passes `'endGameWithSideWinners'`. Used in every
   * `console.error` prefix in this pipeline AND as the context parameter to
   * `notifyPlayersGameFinished`, so Vercel logs still tell the two finish
   * entry points apart.
   */
  logContext?: string;
};

export type EndGameCoreResult =
  | {
      ok: true;
      gameName: string;
      /**
       * True when the optimistic lock found no `active` row to flip — someone
       * else (another admin tab, the phone) finished this game in the split
       * second since the status check above. Idempotent SUCCESS, not a failure:
       * the end state is exactly what the caller asked for, so every caller
       * still redirects to «avsluttet». Mirrors `startScheduledGameCore`'s
       * `started` boolean, and like it, only the flip WINNER runs the follow-up
       * work (#1856).
       */
      alreadyFinished: boolean;
    }
  | {
      ok: false;
      reason:
        | 'not_active'
        | 'no_players'
        | 'not_all_submitted'
        | 'not_all_approved'
        | 'db_winners'
        | 'db_finish';
    };

/**
 * The callable core of the admin/creator «avslutt spill»-pipeline, extracted
 * from the `endGame` server action (#1501) so the cup one-tap finish can drive
 * the REAL finish per host match instead of duplicating the pipeline (bug-
 * prevention trap #4: one rule, one home).
 *
 * Contract vs. the old inline body:
 *  - Returns a result instead of redirecting — the caller maps it to whatever
 *    it needs (`endGame` → redirect; `finishTournament` → collect + banner).
 *  - Takes the Supabase client explicitly: `endGame` passes the request-scoped
 *    client (writes under the creator-UPDATE RLS, migration 0071); the cup path
 *    passes the admin client because a klubb-styrer isn't the games' creator
 *    (AGENTS.md trap #3 — authz is deliberate, not inherited; the cup route is
 *    gated by `requireAdminOrClubAdminOfCup` before this ever runs).
 *  - Takes the actor explicitly (audit log) and gates the two reveal
 *    notifications behind `suppressPerGameNotifications`.
 *  - #1488 (K1): also absorbs the former `endGameWithSideWinners` twin via
 *    `sideWinners` (upserted before the flip), `auditExtras` (merged into the
 *    audit payload) and `logContext` (log-prefix + notify context). The
 *    side-tournament action is now a thin wrapper: it parses the winner form
 *    and maps results to redirects, this is the single finish pipeline.
 *
 *  - #1856 (N6c): this function is now the GATES + the two writes. Everything
 *    after the status flip — derived games, result summaries, differentials,
 *    achievements, round report, audit log, varsler + mail — moved verbatim to
 *    `runFinishPipeline`, which the finish-pipeline sweep also calls for games
 *    the phone finished on its own. Order, per-step client choice and the
 *    best-effort wrapping are unchanged; this call site just delegates.
 *
 * Everything else — query order, the winners-before-flip rule, the cache
 * revalidation — is byte-identical to the old `endGame` body, so the thin
 * `endGame` wrapper stays behaviourally unchanged apart from the optimistic
 * lock on the flip (a concurrent second finish is now a no-op success instead
 * of a duplicate mail blast).
 */
export async function endGameCore(
  supabase: SupabaseClient<Database>,
  gameId: string,
  actor: EndGameActor,
  options: EndGameCoreOptions = {},
): Promise<EndGameCoreResult> {
  const {
    allowMissing = false,
    suppressPerGameNotifications = false,
    sideWinners,
    auditExtras,
    logContext = 'endGame',
  } = options;

  // Verify game is active. Inkluderer game_mode + mode_config + course_id
  // slik at vi kan bygge mode-aware completion-mail uten å re-fetche game.
  // #1441: hole_segment også — persistResultSummaries trenger den for at et
  // segment-HOST-spills (front9/back9) eget resultatsammendrag skal regnes
  // over de riktige 9 hullene, ikke alle 18.
  const { data: game } = await supabase
    .from('games')
    .select(
      'id, name, status, require_peer_approval, course_id, game_mode, mode_config, hole_segment',
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
      hole_segment: HoleSegment;
    }>();
  if (!game || game.status !== 'active') {
    return { ok: false, reason: 'not_active' };
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
    return { ok: false, reason: 'no_players' };
  }
  for (const p of players) {
    // Withdrawn (WD, #386): out of the ranking entirely — never counts as a
    // missing submission or a pending approval, so they never block the end.
    if (p.withdrawn_at) continue;
    if (!p.submitted_at) {
      // No-show: block by default, but let «avslutt likevel» skip past them.
      // submitted_at stays null — they show as «ikke levert», never a false
      // levering; their registered scores still count in the leaderboard.
      if (!allowMissing) {
        return { ok: false, reason: 'not_all_submitted' };
      }
      continue;
    }
    if (game.require_peer_approval && !p.approved_at) {
      return { ok: false, reason: 'not_all_approved' };
    }
  }

  // #1488 (K1/K2): persist LD/CTP side-tournament winners BEFORE the status
  // flip so a partial failure leaves the game `active` (result `db_winners`)
  // and the organiser can retry. Idempotent on the (game_id, category,
  // position) PK — re-submitting the wizard overwrites. Ordinary finishes pass
  // no `sideWinners`, so this is a no-op for them.
  if (sideWinners && sideWinners.length > 0) {
    const rows = sideWinners.map((w) => ({
      game_id: gameId,
      category: w.category,
      position: w.position,
      winner_user_id: w.winner_user_id,
    }));
    const { error: winnerErr } = await supabase
      .from('game_side_winners')
      .upsert(rows, { onConflict: 'game_id,category,position' });
    if (winnerErr) {
      console.error(`[${logContext}] winners insert failed`, winnerErr);
      return { ok: false, reason: 'db_winners' };
    }
  }

  // Status flip WITH an optimistic lock (#1856). The `.eq('status','active')`
  // makes a concurrent finish a no-op instead of a second flip that re-stamps
  // `ended_at` and re-runs the whole tail; `.select('id')` is what reveals who
  // won — the winner gets its row back, a loser gets an empty array. Same shape
  // as `startScheduledGameCore`'s scheduled→active flip.
  //
  // The window is narrow (between the status read at the top of this function
  // and this UPDATE) but it is real now that the phone can finish a game too:
  // before the lock, the loser silently sent a second «Resultatet er klart»-mail
  // to everyone and billed a second round report.
  const endedAt = new Date().toISOString();
  const { data: flipped, error } = await supabase
    .from('games')
    .update({ status: 'finished', ended_at: endedAt })
    .eq('id', gameId)
    .eq('status', 'active')
    .select('id');

  if (error) {
    console.error(`[${logContext}] finish status update failed`, error);
    return { ok: false, reason: 'db_finish' };
  }

  const flipWon = (flipped?.length ?? 0) > 0;

  // Only the flip winner owns the tail. A loser returns success — the game IS
  // finished, which is what the caller wanted — without touching notifications,
  // mail or the billed round report; whoever won them owns them. (The tail
  // claims `finish_pipeline_at` for itself as well, so even a lost race here
  // could not double-run it — belt and braces, cheap.)
  if (flipWon) {
    await runFinishPipeline(supabase, {
      game: {
        id: gameId,
        name: game.name,
        course_id: game.course_id,
        game_mode: game.game_mode,
        mode_config: game.mode_config,
        hole_segment: game.hole_segment,
      },
      // Unfiltered on purpose: withdrawn players still get the round-over varsel.
      players,
      endedAt,
      actor,
      suppressPerGameNotifications,
      auditExtras,
      logContext,
    });
  }

  revalidateTag(`game-${gameId}`, 'max');
  revalidatePath(`/admin/games/${gameId}`);
  revalidatePath(`/games/${gameId}`);
  return { ok: true, gameName: game.name, alreadyFinished: !flipWon };
}
