import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, gameRefreshAccess } from '@/lib/api/appAuth';
import { expireGameCache } from '@/lib/games/expireGameCache';

// Tøm nettsidens spill-cache etter en skriving i native-appen (#2215).
//
// Nettsiden leser `games`, `game_players` og wolf-/BBB-valgene fra
// `getGameWithPlayers`-cachen (tag `game-${id}`, `revalidate: 900`). Webbens egne
// skrivinger tømmer taggen; appens skrivinger rett mot PostgREST gjorde det
// ikke. Da så en makker på nettsiden gammel status — venterommet etter start,
// «fant ikke spillet» for en nylig lagt til spiller — i opptil 15 minutter.
//
// Ruta gjør ÉN ting: `expireGameCache(gameId)`. Ingen skriving og ingen
// varsler — webben varsler heller ikke på disse skrivingene (trekk, lag,
// flight, wolf-/BBB-valg). Skrivinger som ER varslet (godkjenn, avvis, start,
// legg til spiller) går gjennom sine egne ruter, som tømmer cachen selv.
//
// AUTH: `lib/api/appAuth.ts`. `Authorization: Bearer <access_token>` validert
// mot GoTrue; spill-id-en kommer KUN fra stien og kalleren KUN fra tokenet.
// Porten (`gameRefreshAccess`) slipper inn arrangøren og aktive spillere i
// runden — wolf- og BBB-valgene kommer fra spillere, ikke fra arrangøren.
//
// WIRE (appen speiler den; ruta og app-halvdelen endres i samme PR):
//   POST 200 {}
//        401 { error: 'unauthorized' }   403 { error: 'forbidden' }
//        404 { error: 'not_found' }      500 { error: 'refresh_failed' }
//
// Ingen body, ingen query. 404 for et ukjent spill gjelder ALLE kallere, også
// en admin. Feil-bodyene er faste koder, aldri `err.message`.
//
// `maxDuration` settes IKKE: ett cache-kall, ingen varsler eller mail.

const LOG_PREFIX = 'api/games/[id]/refresh';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id: gameId } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const access = await gameRefreshAccess(userId, gameId);
    if (access === 'game_not_found') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (access === 'forbidden') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    expireGameCache(gameId);
    return NextResponse.json({});
  } catch (err) {
    console.error(`[${LOG_PREFIX}] refresh threw`, err);
    return NextResponse.json({ error: 'refresh_failed' }, { status: 500 });
  }
}
