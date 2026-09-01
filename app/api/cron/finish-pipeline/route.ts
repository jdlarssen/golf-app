import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireCronAuth } from '@/lib/cron/auth';
import { runFinishPipelineForGame } from '@/lib/games/runFinishPipeline';

// Finish-pipeline sweep — issue #1856 (native N6c).
//
// The native app can flip a game to 'finished' entirely on its own (creator RLS,
// migration 0071), but it can never run the server-owned tail that follows a
// finish: score differentials are trigger-locked to the service role (0117), and
// the rest needs Resend, the Anthropic SDK and the Next runtime. So the app
// leaves `games.finish_pipeline_at` null and this sweep finishes the job —
// result summaries, differentials, achievements, the round report, the audit
// entry and the «Resultatet er klart»-mail. A web finish still runs the very
// same tail synchronously inside endGameCore; this route is the second entry
// point to one implementation, never a copy of it.
//
// Called by pg_cron + pg_net (migration 0170) every minute, but only when a game
// actually owes a tail (the cron job's EXISTS gate). NOT a Vercel cron — Hobby
// caps those at 1/day, and a finish that reaches the players a day late is not a
// finish — so this route is absent from vercel.json on purpose, exactly like
// start-scheduled-games (#502).
//
// POST because pg_net can only make POST requests.
//
// Idempotency is NOT this route's job and must not be re-implemented here:
// `runFinishPipeline` wins the `finish_pipeline_at` row before it does any work
// (claim-first, at-most-once), because the tail sends real mail, writes
// non-idempotent varsler and bills an Anthropic call. A `ran: false` therefore
// means "another runner owns this game" — an ordinary outcome, not a failure.

export const maxDuration = 60;

// `finishPipeline`, not the template's `cron/<route-name>`: every line this sweep
// produces — from this file and from inside runFinishPipeline — then carries one
// greppable prefix, which is what the contract asked for and what makes a single
// game's tail readable end to end in the Vercel log trail.
const LOG_PREFIX = 'finishPipeline';

// No time window, deliberately — unlike the scheduled-start sweep's
// SWEEP_WINDOW_DAYS. That window exists because a blocked scheduled game stays
// due forever; here a candidate leaves the set on its first reachable pass
// whether its tail succeeds or fails, because the claim is written before the
// work. Nothing can accumulate except while this route is unreachable, and a
// window would then permanently orphan every game finished during the outage.
// Migration 0170's EXISTS gate is windowless for the same reason.
//
// What IS bounded is the batch, and the claim-first design is precisely why it
// has to be: a game claimed and then cut off by the platform's `maxDuration`
// loses its tail for good. One tail can bill an Anthropic round-report call, so
// five per pass keeps even a slow loop inside the 60s budget while still
// draining 300 games/hour after an outage. Oldest finish first, so nothing at
// the back of a backlog starves.
const SWEEP_BATCH_LIMIT = 5;

type PendingGame = { id: string };

export async function POST(request: NextRequest) {
  const denied = requireCronAuth(request, LOG_PREFIX);
  if (denied) return denied;

  // Service-role client: the tail reads across the whole roster and every
  // derived game, and its marker write is refused for any non-admin caller by
  // `guard_games_finish_pipeline_at` (0169).
  const admin = getAdminClient();

  // The candidate set, verbatim the same three predicates as 0170's cron gate
  // and 0169's partial index — change one and change all three (AGENTS.md
  // trap #4):
  //   status = 'finished'         the flip has happened
  //   finish_pipeline_at is null  but the tail has not run (0169 backfilled
  //                               every pre-existing finished game, so history
  //                               is invisible here — no mass re-notification)
  //   tournament_id is null       cup rounds are excluded: the cup flow owns its
  //                               own finish path and the suppress-notifications
  //                               mechanics, and the app refuses to end a cup
  //                               round in the first place
  const { data: pending, error: pendingError } = await admin
    .from('games')
    .select('id')
    .eq('status', 'finished')
    .is('finish_pipeline_at', null)
    .is('tournament_id', null)
    .order('ended_at', { ascending: true })
    .limit(SWEEP_BATCH_LIMIT)
    .returns<PendingGame[]>();

  if (pendingError) {
    console.error(`[${LOG_PREFIX}] pending-games query failed`, pendingError);
    return NextResponse.json(
      { ok: false, error: 'pending-games query failed' },
      { status: 500 },
    );
  }

  const completed: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  // Sequential on purpose: the tail is IO-heavy (mail, AI, several DB passes)
  // and the candidate set is normally one game — the gate fires this sweep the
  // minute someone finishes a round.
  for (const game of pending ?? []) {
    // Per-game try/catch: every step inside the tail is best-effort by its own
    // contract, so a throw out here is an unexpected one — and it must not cost
    // the other games in the batch their tail. The claim has already been
    // written by then, so this game will NOT be retried; the log line is the
    // trail that says which game to look at.
    try {
      const { ran } = await runFinishPipelineForGame(admin, game.id, {
        logContext: LOG_PREFIX,
      });

      if (!ran) {
        // Claim lost to a racing runner, or the game is no longer finishable
        // (reopened, no creator to attribute the finish to). runFinishPipeline
        // has logged the reason; neither case is this sweep's failure.
        continue;
      }

      completed.push(game.id);

      // Same invalidation the other finish paths do: the app flipped the row
      // straight through PostgREST, which no cache tag can see, and this pass
      // has just written result summaries and differentials on top. Without it
      // the game page keeps serving its pre-finish snapshot.
      revalidateTag(`game-${game.id}`, 'max');
    } catch (err) {
      console.error(`[${LOG_PREFIX}] game ${game.id} failed`, err);
      failed.push({
        id: game.id,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  // `checked` counts the batch; a game that ran is in `completed`, one that threw
  // is in `failed`, and one whose claim was lost is in neither — deliberately, so
  // an operator reading these numbers can tell "nothing to do" from "something
  // went wrong".
  return NextResponse.json({
    ok: true,
    checked: pending?.length ?? 0,
    completed,
    failed,
  });
}
