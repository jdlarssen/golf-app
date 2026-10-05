import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireCronAuth } from '@/lib/cron/auth';
import {
  runStaleGameReminderForGame,
  type StaleSweepGame,
} from '@/lib/notifications/organizerNotices';

// Påminnelsen om et spill som står stille — #2203.
//
// Ingenting avslutter et spill av seg selv (eierens valg 2026-09-25), og et
// spill sto «Pågående» i over to uker uten at noen la merke til det. Denne
// sveipen finner aktive spill der ingenting har skjedd på et døgn (ingen slag,
// leveringer, godkjenninger eller tilbaketrekkinger) og sender arrangøren én
// `game_stale_reminder`. Regelen bor i `lib/games/organizerNoticeRules.ts`
// (`isStale`), kravet og sendingen per spill i `runStaleGameReminderForGame`.
// Ruta er bare orkestreringen.
//
// Kalt av pg_cron + pg_net (migrasjon 0205) hver time, men bare når et spill
// er kandidat (jobbens EXISTS-port). Ikke en Vercel-cron: Hobby gir én kjøring
// i døgnet (samme grunn som start-scheduled-games, #502). POST fordi pg_net
// bare kan POST-e.
//
// Idempotens er IKKE rutas jobb: kravet per spill
// (`organizer_stale_reminder_sent_at is null`) gjør at påminnelsen går én gang
// per spill, også når to kjøringer møtes (eierens svar 2026-10-05: «Én per
// spill»).

export const maxDuration = 60;

const LOG_PREFIX = 'staleGameReminder';

// Et spill yngre enn et døgn kan ikke ha stått stille et døgn.
const STALE_MIN_AGE_MS = 24 * 60 * 60 * 1000;

// Taket er per kjøring. Et spill som fortsatt spilles, blir stående som
// kandidat til det er avsluttet eller påminnet, så med flere enn 25 samtidige
// kandidater kan de nyeste vente én kjøring. Eldste start først. 25 × (siste
// slag + roster) holder seg godt innenfor 60 s.
const SWEEP_BATCH_LIMIT = 25;

export async function POST(request: NextRequest) {
  const denied = requireCronAuth(request, LOG_PREFIX);
  if (denied) return denied;

  // Service-role: sveipen leser slag og roster på tvers av spillere, og
  // stempler `organizer_stale_reminder_sent_at` på spill den ikke eier.
  const admin = getAdminClient();

  // ÉN REGEL, TO HJEM (AGENTS.md trap 4). Kandidatene står skrevet her og i
  // 0205s EXISTS-port. Endres ett predikat, endres begge i samme commit:
  //   status = 'active'                          runden pågår
  //   source_game_id is null                     avledede spill har aldri
  //                                              egne leveringer
  //   tournament_id is null                      en cup avsluttes samlet
  //   created_by is not null                     noen å minne på
  //   organizer_stale_reminder_sent_at is null   én gang per spill
  //   started_at < now - 24 t                    se STALE_MIN_AGE_MS
  const now = Date.now();
  const { data: candidates, error: candidatesError } = await admin
    .from('games')
    .select('id, name, created_by, started_at')
    .eq('status', 'active')
    .is('source_game_id', null)
    .is('tournament_id', null)
    .not('created_by', 'is', null)
    .is('organizer_stale_reminder_sent_at', null)
    .lt('started_at', new Date(now - STALE_MIN_AGE_MS).toISOString())
    .order('started_at', { ascending: true })
    .range(0, SWEEP_BATCH_LIMIT - 1)
    .returns<StaleSweepGame[]>();

  if (candidatesError) {
    console.error(`[${LOG_PREFIX}] candidate query failed`, candidatesError);
    return NextResponse.json(
      { ok: false, error: 'candidate query failed' },
      { status: 500 },
    );
  }

  let reminded = 0;
  const failed: Array<{ id: string; error: string }> = [];

  // Ett spill om gangen, med egen try/catch: en feil i ett spill skal ikke
  // koste de andre påminnelsen.
  for (const game of candidates ?? []) {
    try {
      const result = await runStaleGameReminderForGame(admin, game, now);
      if (result.reminded) reminded += 1;
    } catch (err) {
      console.error(`[${LOG_PREFIX}] game ${game.id} failed`, err);
      failed.push({ id: game.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  // `checked` teller spillene i batchen, `reminded` påminnelsene som gikk.
  return NextResponse.json({
    ok: true,
    checked: candidates?.length ?? 0,
    reminded,
    failed,
  });
}
