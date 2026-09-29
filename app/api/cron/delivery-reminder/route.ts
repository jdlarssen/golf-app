import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireCronAuth } from '@/lib/cron/auth';
import {
  runDeliveryReminderSweepForGame,
  type SweepGame,
} from '@/lib/notifications/deliveryReminder';

// Påminnelses-sveipen — #2200 del 2.
//
// Leverings-påminnelsen gikk før bare når spilleren selv åpnet spillsiden, og
// aldri til gjester. De som ikke leverte, hadde nesten aldri tastet et slag
// selv, så den traff sjelden noen som kunne gjøre noe. Nå finner denne sveipen
// kortene som har vært ferdige i et kvarter, og sender påminnelsen til den som
// kan levere dem. Regelen bor i `lib/games/deliveryReminderSweep.ts`, og
// kravet og sendingen per spill i `runDeliveryReminderSweepForGame`. Ruta er
// bare orkestreringen.
//
// Kalt av pg_cron + pg_net (migrasjon 0192) hvert femte minutt, men bare når
// et spill har noe å purre (jobbens EXISTS-port). Ikke en Vercel-cron: Hobby
// gir én kjøring i døgnet (samme grunn som start-scheduled-games, #502).
// POST fordi pg_net bare kan POST-e.
//
// Idempotens er IKKE rutas jobb: kravet per påminnelse (`deliver_reminder_sent_at
// is null`) gjør at hvert kort purres én gang, også når to kjøringer møtes.

export const maxDuration = 60;

const LOG_PREFIX = 'deliveryReminderSweep';

// Vinduet: bare spill startet de siste to døgnene. En runde går over én dag,
// og et aktivt spill ingen avslutter, har kort som aldri blir fulle. Uten
// vinduet ville slike spill vært kandidater for alltid, tatt plassene i
// batchen og til slutt stengt nye runder ute. Samme grunn som
// start-scheduled-games sitt vindu (0094).
const SWEEP_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

// Taket er per kjøring. Et aktivt spill med kort som ikke er ferdige ennå, blir
// stående som kandidat hele runden, så med flere enn 25 samtidige spill med noe
// å purre kan de nyeste vente én kjøring. Eldste start først. 25 × (roster +
// slag) holder seg godt innenfor 60 s.
const SWEEP_BATCH_LIMIT = 25;

type PendingGame = SweepGame & { game_players: { user_id: string }[] };

export async function POST(request: NextRequest) {
  const denied = requireCronAuth(request, LOG_PREFIX);
  if (denied) return denied;

  // Service-role: sveipen leser hele rosteret og slagene på tvers av spillere,
  // og stempler `deliver_reminder_sent_at` på andres rader.
  const admin = getAdminClient();

  // ÉN REGEL, TO HJEM (AGENTS.md trap 4). Kandidatene står skrevet her og i
  // 0192s EXISTS-port. Endres ett predikat, endres begge i samme commit:
  //   status = 'active'                  runden pågår
  //   source_game_id is null             avledede spill har aldri egne slag
  //   started_at > now - 2 døgn          se SWEEP_WINDOW_MS
  //   en spiller med submitted_at null, withdrawn_at null og
  //   deliver_reminder_sent_at null      et kort som kan trenge påminnelse
  const now = Date.now();
  const { data: pending, error: pendingError } = await admin
    .from('games')
    .select(
      'id, name, game_mode, hole_segment, source_game_id, tournament_id, scheduled_tee_off_at, created_at, game_players!inner(user_id)',
    )
    .eq('status', 'active')
    .is('source_game_id', null)
    .gt('started_at', new Date(now - SWEEP_WINDOW_MS).toISOString())
    .is('game_players.submitted_at', null)
    .is('game_players.withdrawn_at', null)
    .is('game_players.deliver_reminder_sent_at', null)
    .order('started_at', { ascending: true })
    .range(0, SWEEP_BATCH_LIMIT - 1)
    .returns<PendingGame[]>();

  if (pendingError) {
    console.error(`[${LOG_PREFIX}] pending-games query failed`, pendingError);
    return NextResponse.json(
      { ok: false, error: 'pending-games query failed' },
      { status: 500 },
    );
  }

  let reminded = 0;
  const failed: Array<{ id: string; error: string }> = [];

  // Ett spill om gangen, med egen try/catch: en feil i ett spill skal ikke
  // koste de andre påminnelsen.
  for (const game of pending ?? []) {
    try {
      const result = await runDeliveryReminderSweepForGame(admin, game, now);
      reminded += result.reminded;
    } catch (err) {
      console.error(`[${LOG_PREFIX}] game ${game.id} failed`, err);
      failed.push({ id: game.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  // `checked` teller spillene i batchen, `reminded` påminnelsene som gikk.
  return NextResponse.json({
    ok: true,
    checked: pending?.length ?? 0,
    reminded,
    failed,
  });
}
