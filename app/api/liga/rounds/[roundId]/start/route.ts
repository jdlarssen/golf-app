import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import {
  startLeagueRoundFlightCore,
  type LeagueStartRefusal,
} from '@/lib/league/startLeagueRoundFlightCore';
import { readFlightIds } from '@/lib/api/readFlightIds';
import { MAX_CO_PLAYERS } from '@/lib/league/flightRules';
import { isUuid } from '@/lib/url/isUuid';

// «Spill runden» i appen (#2638): spilleren starter en flight i en ligarunde.
//
// Ruta er bare transport. Reglene (vinduet, medlemskapet, markørregelen med én
// spiller i en simulatorliga, én tellende flight per spiller og fastfrysingen
// av rundeinnstillingene) bor i `startLeagueRoundFlightCore`, som webbens
// `startLeagueRoundFlight` også kjører. Ingen regel speiles her (AGENTS trap 4).
//
// AUTH: `authenticatedUserId` — spilleren kommer bare fra det validerte
// tokenet, runden bare fra stien. Kjernen leser og skriver som spilleren
// (`callerScopedClient`), og selve flight-raden med service role, slik webben
// gjør (#2207).
//
// KROPPEN `{ coPlayerIds: string[] }` er medspillerne spilleren vil ha med.
// Den kan ikke velge hvem som starter, og kjernen sjekker hver id mot
// deltakerlista (`not_member`). Tom eller uten felt = alene.
//
// WIRE (appen speiler den):
//   POST { coPlayerIds?: string[] }   0–3 uuid-er (MAX_CO_PLAYERS, readFlightIds)
//     200 { gameId }
//     400 { error: 'bad_request' }    kroppen er ikke JSON, eller lista er feilformet
//     401 { error: 'unauthorized' }
//     404 { error: 'not_found' }      runden eller ligaen finnes ikke
//     409 { error: <LeagueStartRefusal> }
//     500 { error: 'start_failed' }   også når runden eller ligaen ikke kunne leses
//
// Feil-bodyene er faste koder, aldri `err.message`. Etter start trengs ikke
// noe etterarbeid: flighten er ny og har ingen cache ennå, og ligasidene
// leser direkte (samme som web-actionen, som bare sender videre til spillet).
//
// `maxDuration = 60`, som startruta: starten fryser handicap per spiller i
// samme rundtur.
export const maxDuration = 60;

const LOG_PREFIX = 'api/liga/rounds/[roundId]/start';

/**
 * Kjernens avvisninger, oversatt til HTTP. Ett kart og ingen `default`: en ny
 * kode i kjernen feller tsc her i stedet for å bli en stille 500.
 */
const REFUSAL_STATUS: Record<LeagueStartRefusal, 404 | 409 | 500> = {
  round_not_found: 404,
  round_read_failed: 500,
  league_not_found: 404,
  league_read_failed: 500,
  league_not_active: 409,
  outside_window: 409,
  round_not_ready: 409,
  need_marker: 409,
  flight_too_large: 409,
  not_member: 409,
  already_played: 409,
  flight_in_progress: 409,
  co_player_locked: 409,
  members_failed: 500,
  round_check_failed: 500,
  settings_freeze_failed: 500,
  insert_failed: 500,
  start_tee_missing: 409,
  start_tee_missing_rating: 409,
  start_no_players: 409,
  start_pending_players: 409,
  start_incomplete_sides: 409,
  start_unassigned_teams: 409,
  start_uneven_teams: 409,
  start_unassigned_flights: 409,
  start_rotation_player_count: 409,
  start_decided_by_withdrawal: 409,
  start_cup_finished: 409,
  start_not_found: 500,
  start_not_scheduled: 500,
  start_db_players: 500,
  start_db_game: 500,
};

type RouteContext = { params: Promise<{ roundId: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { roundId } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(roundId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const coPlayerIds = await readFlightIds(request, 'coPlayerIds', MAX_CO_PLAYERS);
    if (coPlayerIds === null) return NextResponse.json({ error: 'bad_request' }, { status: 400 });

    const caller = callerScopedClient(request);
    if (!caller) throw new Error('caller-scoped client unavailable');

    const result = await startLeagueRoundFlightCore(caller, userId, roundId, coPlayerIds);
    if (!result.ok) {
      const status = REFUSAL_STATUS[result.error];
      const error = status === 404 ? 'not_found' : status === 500 ? 'start_failed' : result.error;
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ gameId: result.gameId });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] start threw`, err);
    return NextResponse.json({ error: 'start_failed' }, { status: 500 });
  }
}
