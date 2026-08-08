import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { getAdminClient } from '@/lib/supabase/admin';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import { startDerivedGames } from '@/lib/games/syncDerivedGamesStatus';
import { notifyPlayersGameStarted } from '@/lib/notifications/events';
import {
  pickStartNotificationTargets,
  type StartedGameForNotify,
} from '@/lib/notifications/startNotificationTargets';
import {
  isStructuralBlockReason,
  maybeNotifyAutoStartBlocked,
} from '@/lib/notifications/autoStartBlocked';
import type { HoleSegment } from '@/lib/scoring';

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
//
// #1450: the sweep runs in two phases — flip every due game first, then a
// single notification pass over everything that actually started. A split
// cup day (#1441) makes four games per flight due in the same minute with the
// same four players, so per-game notification meant 2–3 pushes per player,
// and WHICH count you got depended on the (unordered) due-query row order.
// `pickStartNotificationTargets` collapses that to one game per player.

export const maxDuration = 60;

const LOG_PREFIX = 'cron/start-scheduled-games';

// Mirror of the cron job's EXISTS-gate window (migration 0094): games whose
// tee-off passed more than 7 days ago stop being swept — they're abandoned
// or permanently blocked, and lazy-start still covers them on page visit.
const SWEEP_WINDOW_DAYS = 7;

type DueGame = {
  id: string;
  name: string;
  created_by: string | null;
  tournament_id: string | null;
  /** DB-kolonnen er `text` med default 'full'; verdiene er HoleSegment-unionen. */
  hole_segment: HoleSegment;
  source_game_id: string | null;
};

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
    .select('id, name, created_by, tournament_id, hole_segment, source_game_id')
    .eq('status', 'scheduled')
    .lte('scheduled_tee_off_at', now.toISOString())
    .gte('scheduled_tee_off_at', windowStart.toISOString())
    .returns<DueGame[]>();

  if (dueError) {
    console.error(`[${LOG_PREFIX}] due-games query failed`, dueError);
    return NextResponse.json(
      { ok: false, error: 'due-games query failed' },
      { status: 500 },
    );
  }

  const started: string[] = [];
  const blocked: Array<{ id: string; reason: string }> = [];
  // Fase 1 samler opp; fase 2 (etter løkka) varsler én gang per spiller.
  const startedGames: DueGame[] = [];

  // Sequential on purpose: due games are few (the gate fires the sweep the
  // minute they become due), and serial DB writes keep load predictable.
  //
  // try/finally so an unexpected throw partway through the loop still runs the
  // notification pass for the games that DID start before it. Without it,
  // deferring notifications (#1450) would have made one bad game silence the
  // varsel for every earlier one — pre-#1450 those had already been sent.
  try {
    for (const game of due ?? []) {
      const result = await startScheduledGame(admin, game.id);

      if (result.ok) {
        if (result.started) {
          started.push(game.id);
          // Same invalidation as the other start paths so cached game pages
          // stop serving the pre-flip 'scheduled' snapshot.
          revalidateTag(`game-${game.id}`, 'max');

          // #1441 (D3): this sweep won the flip → start every derived game
          // too. Best-effort, see startDerivedGames.
          await startDerivedGames(admin, game.id);

          // #1450: notification is deferred to the post-loop pass — a split
          // cup day starts several of this player's games in the same sweep,
          // and only the whole set tells us which one to point them at.
          startedGames.push(game);
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
  } finally {
    await notifyStartedGames(admin, startedGames);
  }

  return NextResponse.json({
    ok: true,
    checked: due?.length ?? 0,
    started,
    blocked,
  });
}

/**
 * Fase 2 (#1450): ett `game_started` per spiller for alt som ble startet i
 * denne sweepen. Ingen aktør å ekskludere — cron-en starter spillene, ingen
 * spiller trykket på noe.
 *
 * Avledede spill hoppes over allerede før tropp-oppslaget (de varsler aldri —
 * regelens hjem er `notifyPlayersGameStarted`, dette sparer bare rundturene).
 * Resten sendes gjennom `pickStartNotificationTargets`, som gir hver spiller
 * nøyaktig ett spill per cup.
 *
 * Best-effort hele veien: en tropp-feil hopper over det ene spillet,
 * `notifyPlayersGameStarted` svelger sine egne notify-feil, og hele passet er
 * pakket i try/catch — starten er allerede committet, og siden kalleren kjører
 * dette i en `finally`, ville et kast herfra maskert den opprinnelige feilen.
 */
async function notifyStartedGames(
  admin: ReturnType<typeof getAdminClient>,
  startedGames: DueGame[],
): Promise<void> {
  const notifiable = startedGames.filter((g) => g.source_game_id == null);
  if (notifiable.length === 0) return;

  try {
    const withRosters: StartedGameForNotify[] = [];
    for (const game of notifiable) {
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
        continue;
      }
      withRosters.push({
        id: game.id,
        name: game.name,
        tournamentId: game.tournament_id,
        holeSegment: game.hole_segment,
        sourceGameId: game.source_game_id,
        playerIds: (roster ?? []).map((p) => p.user_id),
      });
    }

    for (const target of pickStartNotificationTargets(withRosters)) {
      await notifyPlayersGameStarted(
        target.playerIds.map((user_id) => ({ user_id })),
        target.game,
        LOG_PREFIX,
      );
    }
  } catch (err) {
    console.error(`[${LOG_PREFIX}] varsel-pass failed`, err);
  }
}
