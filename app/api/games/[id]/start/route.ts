import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, gameOrganiserAccess } from '@/lib/api/appAuth';
import { getAdminClient } from '@/lib/supabase/admin';
import { startScheduledGame } from '@/lib/games/startScheduledGame';
import type { StartScheduledGameFailure } from '@/lib/games/startScheduledGameCore';
import { announceStartedGame } from '@/lib/games/announceStartedGame';
import { expireGameCache } from '@/lib/games/expireGameCache';

// «Start runden nå» fra native-appen (#2215). Appen kjørte start-kjernen selv
// med sin RLS-klient: runden startet, men ingen fikk `game_started`, avledede
// spill (#1441) ble stående, `registration_expired` gikk aldri ut, og webbens
// cache viste venterommet til den gikk ut.
//
// Ruta er kun transport. Starten er `startScheduledGame` (kjernen + varselet
// til avslåtte søkere), og etterarbeidet for den som vant flippen er
// `announceStartedGame` — det samme webbens `startScheduledGameAction` kaller.
// Ingen regel speiles her (AGENTS trap 4).
//
// AUTH: `lib/api/appAuth.ts`, den delte adgangssjekken for app→server-ruter.
// `Authorization: Bearer <access_token>` validert mot GoTrue; bruker-id-en
// kommer KUN fra tokenet og spill-id-en KUN fra stien. Bare arrangøren
// (oppretter eller admin) kan starte. Kjernen skriver med service-role, så
// porten under er den eneste tilgangssjekken.
//
// WIRE (appen speiler den):
//   POST (ingen kropp)
//     200 { alreadyRunning: boolean }
//     401 { error: 'unauthorized' }   403 { error: 'forbidden' }
//     404 { error: 'not_found' }
//     409 { error: <kjernens grunn>, rotationMode?, rotationActiveCount? }
//     500 { error: 'start_failed' }
//
// `alreadyRunning` = noen andre (cron, E1, et annet trykk) vant flippen. Det er
// suksess for appen — runden er i gang — men da eier vinneren varslene.
//
// 409 bærer kjernens grunn uendret (`tee_missing`, `pending_players`,
// `rotation_player_count` …), så appen velger setning selv. Rotasjonsfeltene
// følger bare `rotation_player_count`. `pending_players` bærer verken ids eller
// adresser: appen viser en generell tekst (#2207), så feltet ville ikke hatt
// noen leser. `db_players`/`db_game` og kast skjules som
// 500 `start_failed`. Feil-bodyene er faste koder — endepunktet er offentlig
// eksponert, så `err.message` (Postgres-detaljer, env-navn) skal aldri ut.
//
// `maxDuration = 60`: starten fryser handicap per spiller, starter avledede
// spill og sender varsler i samme rundtur. Eneste segment-eksporten repoet
// bruker — `dynamic`/`revalidate`/`runtime` er inkompatible med
// `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/games/[id]/start';

type StartRefusal = StartScheduledGameFailure['reason'];

/**
 * Kjernens avvisninger, oversatt til HTTP. Ett kart og ingen `default`: en ny
 * grunn i kjernen feller tsc her i stedet for å bli en stille 500.
 */
const REFUSAL_STATUS: Record<StartRefusal, 404 | 409 | 500> = {
  not_found: 404,
  not_scheduled: 409,
  tee_missing: 409,
  tee_missing_rating: 409,
  no_players: 409,
  pending_players: 409,
  incomplete_sides: 409,
  decided_by_withdrawal: 409,
  unassigned_teams: 409,
  unassigned_flights: 409,
  rotation_player_count: 409,
  db_players: 500,
  db_game: 500,
};

/** Kroppen for en avvisning. Bare 409 bærer kjernens grunn. */
function refusalBody(failure: StartScheduledGameFailure, status: 404 | 409 | 500) {
  if (status === 404) return { error: 'not_found' };
  if (status === 500) return { error: 'start_failed' };
  return {
    error: failure.reason,
    ...(failure.rotationMode === undefined ? {} : { rotationMode: failure.rotationMode }),
    ...(failure.rotationActiveCount === undefined
      ? {}
      : { rotationActiveCount: failure.rotationActiveCount }),
  };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id: gameId } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const access = await gameOrganiserAccess(userId, gameId);
    if (access === 'game_not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (access === 'not_organiser') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const admin = getAdminClient();
    const result = await startScheduledGame(admin, gameId);
    if (!result.ok) {
      const status = REFUSAL_STATUS[result.reason];
      return NextResponse.json(refusalBody(result, status), { status });
    }

    if (result.started) {
      await announceStartedGame(admin, gameId, userId, LOG_PREFIX);
    }
    // Også når en annen vant: appen og webben skal se den aktive runden nå,
    // ikke når vinnerens egen tømming eventuelt nådde fram.
    expireGameCache(gameId);

    return NextResponse.json({ alreadyRunning: !result.started });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] start threw`, err);
    return NextResponse.json({ error: 'start_failed' }, { status: 500 });
  }
}
