import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import { notifyPlayersGameStarted } from '@/lib/notifications/events';
import {
  isStructuralBlockReason,
  maybeNotifyAutoStartBlocked,
} from '@/lib/notifications/autoStartBlocked';

// Scheduled-start sweep — issue #502.
//
// Called by pg_cron + pg_net (migration 0094) every minute, but only when
// at least one game is actually due (the cron job's EXISTS gate). NOT a
// Vercel cron — Hobby caps those at 1/day, far too coarse for tee-off
// precision — so this route is absent from vercel.json on purpose.
//
// POST because pg_net can only make POST requests (product-update-digest
// is GET because Vercel cron sends GET — same secret, different caller).
//
// Auth: pg_net sends `Authorization: Bearer <cron_secret from Vault>`,
// which must equal CRON_SECRET in Vercel env. 401 on mismatch blocks
// accidental public fetch; 500 surfaces missing configuration.
//
// Per due game this runs the same idempotent, optimistic-locked
// startScheduledGame transition as the E1 page fallback and the admin
// button. Races between the three paths converge: only the flip winner
// (`started: true`) fans out game_started notifications.

export const maxDuration = 60;

const LOG_PREFIX = 'cron/start-scheduled-games';

// Mirror of the cron job's EXISTS-gate window (migration 0094): games whose
// tee-off passed more than 7 days ago stop being swept — they're abandoned
// or permanently blocked, and lazy-start still covers them on page visit.
const SWEEP_WINDOW_DAYS = 7;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error(`[${LOG_PREFIX}] CRON_SECRET not set`);
    return new NextResponse('CRON_SECRET not configured', { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Service-role client: the transition writes ALL players' course_handicap
  // and flips games.status — system-level work with no user session (same
  // rationale as the E1 fallback, see app/[locale]/games/[id]/(home)/page.tsx).
  const admin = getAdminClient();

  const now = new Date();
  const windowStart = new Date(
    now.getTime() - SWEEP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  const { data: due, error: dueError } = await admin
    .from('games')
    .select('id, name, created_by')
    .eq('status', 'scheduled')
    .lte('scheduled_tee_off_at', now.toISOString())
    .gte('scheduled_tee_off_at', windowStart.toISOString())
    .returns<{ id: string; name: string; created_by: string | null }[]>();

  if (dueError) {
    console.error(`[${LOG_PREFIX}] due-games query failed`, dueError);
    return NextResponse.json(
      { ok: false, error: 'due-games query failed' },
      { status: 500 },
    );
  }

  const started: string[] = [];
  const blocked: Array<{ id: string; reason: string }> = [];

  // Sequential on purpose: due games are few (the gate fires the sweep the
  // minute they become due), and serial DB writes keep load predictable.
  for (const game of due ?? []) {
    const result = await startScheduledGame(admin, game.id);

    if (result.ok) {
      if (result.started) {
        started.push(game.id);
        // Same invalidation as the other start paths so cached game pages
        // stop serving the pre-flip 'scheduled' snapshot.
        revalidateTag(`game-${game.id}`, 'max');

        // game_started to every active player — nobody triggered this start,
        // so there's no actor to exclude. Best-effort: a notify failure must
        // not abort the rest of the sweep.
        const { data: roster, error: rosterError } = await admin
          .from('game_players')
          .select('user_id')
          .eq('game_id', game.id)
          .is('withdrawn_at', null)
          .returns<{ user_id: string }[]>();
        if (rosterError) {
          console.error(
            `[${LOG_PREFIX}] roster fetch for varsel failed (game ${game.id})`,
            rosterError,
          );
        } else {
          await notifyPlayersGameStarted(
            roster ?? [],
            { id: game.id, name: game.name },
            LOG_PREFIX,
          );
        }
      }
      // started=false → another path won the flip in this same minute;
      // that path owns notifications. Nothing to do.
      continue;
    }

    blocked.push({ id: game.id, reason: result.reason });
    if (isStructuralBlockReason(result.reason)) {
      // Expected state (e.g. matchplay sides not full yet, #544) — the sweep
      // retries every minute and starts the game the moment it resolves.
      // info-level so a permanently waiting game doesn't spam error logs.
      console.log(`[${LOG_PREFIX}] game ${game.id} blocked: ${result.reason}`);
      await maybeNotifyAutoStartBlocked({
        gameId: game.id,
        gameName: game.name,
        createdBy: game.created_by,
        reason: result.reason,
        logPrefix: LOG_PREFIX,
      });
    } else {
      // Transient (db_*) or unexpected — error-level for the Vercel log trail.
      console.error(
        `[${LOG_PREFIX}] game ${game.id} could not start: ${result.reason}`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    checked: due?.length ?? 0,
    started,
    blocked,
  });
}
