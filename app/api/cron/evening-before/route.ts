import { NextResponse, type NextRequest } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireCronAuth } from '@/lib/cron/auth';
import { eveningSweepWindow } from '@/lib/games/eveningBeforeRules';
import {
  runEveningNoticeForGame,
  type EveningSweepGame,
} from '@/lib/notifications/eveningStatusNotice';

// Kvelden før — #2483.
//
// Kvelden før en planlagt runde, fra kl. 18 norsk tid, får arrangøren ett
// varsel: «I morgen: Lørdagsrunden. 7 av 8 har bekreftet. Kari har ikke
// svart.» Regelen bor i `lib/games/eveningBeforeRules.ts`
// (`isEveningNoticeDue`), kravet og sendingen per runde i
// `runEveningNoticeForGame`. Ruta er bare orkestreringen. Navnet er generelt,
// så påminnelsen til spillerne kvelden før (#2450) kan legges hit senere.
//
// Kalt av pg_cron + pg_net (migrasjon 0242) hvert kvarter, men bare når en
// runde er kandidat (jobbens EXISTS-port). Ikke en Vercel-cron: Hobby gir én
// kjøring i døgnet (samme grunn som start-scheduled-games, #502). POST fordi
// pg_net bare kan POST-e.
//
// Idempotens er IKKE rutas jobb: kravet per runde
// (`organizer_evening_notice_sent_at is null`) gjør at varselet går én gang
// per runde, også når to kjøringer møtes.

export const maxDuration = 60;

const LOG_PREFIX = 'eveningBefore';

// Taket er per kjøring. Tidsvinduet under er videre enn i morgen (se
// `eveningSweepWindow`), og en runde som aldri blir «due» (en solorunde),
// blir stående som kandidat. Tidligst tee-off først, så morgendagens runder
// kommer før overmorgens. 50 × (spillerliste + krav) holder seg godt innenfor
// 60 s.
const SWEEP_BATCH_LIMIT = 50;

export async function POST(request: NextRequest) {
  const denied = requireCronAuth(request, LOG_PREFIX);
  if (denied) return denied;

  const now = Date.now();
  const window = eveningSweepWindow(now);
  if (!window.open) return NextResponse.json({ ok: true, checked: 0, notified: 0, failed: [] });

  // Service-role: sveipen leser spillerlistene og stempler
  // `organizer_evening_notice_sent_at` på runder den ikke eier.
  const admin = getAdminClient();

  // ÉN REGEL, TRE HJEM (AGENTS.md trap 4). `isEveningNoticeDue` avgjør; denne
  // spørringen og 0242s EXISTS-port velger rundene den kan si ja til. Endres
  // ett predikat, endres alle tre i samme commit:
  //   status = 'scheduled'                         runden er satt opp, ikke i gang
  //   tournament_id is null                        ikke en cupkamp
  //   source_game_id is null                       ikke et avledet spill
  //   league_round_id is null                      ikke en ligaflight
  //   created_by is not null                       noen å si fra til
  //   organizer_evening_notice_sent_at is null     én gang per runde
  //   tee-off i morgen (Oslo)                      her et videre vindu; regelen
  //                                                avgjør dagen
  //   klokka i Oslo er 18 eller mer                `window.open`
  //   created_at før kl. 18 i dag                  en runde satt opp senere
  //                                                samme kveld får ingenting
  //   en annen spiller enn arrangøren på lista     regelen, etter at lista er lest
  const { data: candidates, error: candidatesError } = await admin
    .from('games')
    .select(
      'id, name, status, scheduled_tee_off_at, created_at, created_by, tournament_id, source_game_id, league_round_id, organizer_evening_notice_sent_at',
    )
    .eq('status', 'scheduled')
    .is('tournament_id', null)
    .is('source_game_id', null)
    .is('league_round_id', null)
    .not('created_by', 'is', null)
    .is('organizer_evening_notice_sent_at', null)
    .gt('scheduled_tee_off_at', window.teeOffAfter)
    .lt('scheduled_tee_off_at', window.teeOffBefore)
    .lt('created_at', window.createdBefore)
    .order('scheduled_tee_off_at', { ascending: true })
    .range(0, SWEEP_BATCH_LIMIT - 1)
    .returns<EveningSweepGame[]>();

  if (candidatesError) {
    console.error(`[${LOG_PREFIX}] candidate query failed`, candidatesError);
    return NextResponse.json({ ok: false, error: 'candidate query failed' }, { status: 500 });
  }

  let notified = 0;
  const failed: Array<{ id: string; error: string }> = [];

  // Én runde om gangen, med egen try/catch: en feil i én runde skal ikke
  // koste de andre varselet.
  for (const game of candidates ?? []) {
    try {
      const result = await runEveningNoticeForGame(admin, game, now);
      if (result.notified) notified += 1;
    } catch (err) {
      console.error(`[${LOG_PREFIX}] game ${game.id} failed`, err);
      failed.push({ id: game.id, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  // `checked` teller rundene i batchen, `notified` varslene som gikk.
  return NextResponse.json({ ok: true, checked: candidates?.length ?? 0, notified, failed });
}
