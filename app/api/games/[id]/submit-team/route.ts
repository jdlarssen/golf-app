import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getAdminClient } from '@/lib/supabase/admin';
import { readFlightIds, readUuidField } from '@/lib/api/readFlightIds';
import {
  submitScorecardWithMarker,
  type SubmitWithMarkerResult,
} from '@/lib/league/setFlightMarkerCore';

// Levering av scorekort fra native-appen, solo, lag og flighten (#1918, #2215,
// #2200).
//
// Stien sier `submit-team` fordi ruta kom til for lagkortet: i formatene som
// kollapser til ett lagkort (scramble-familien + alternate-shot-matchplay)
// markerer én levering HELE lagets aktive, uleverte rader, og RLS lar en
// spiller bare skrive sin egen rad. Siden #2215 leverer appen ALLE kort her. En
// solo-spiller (eller en spiller uten lag) markerer bare sin egen rad. Før det
// skrev appen solo-leveringen rett i databasen og hoppet over varslene
// (`peer_approval_request`, `scorecard_submitted`, admin-mailen) og
// cache-tømmingen. Stien og wire-kontrakten er frosset: installerte bygg
// kaller den, så navnet blir stående.
//
// Ruta er kun transport foran `lib/games/submitScorecardCore.ts`. Leverings-
// regelen, søsken-kaskaden og varslene bor der og speiles ALDRI her (AGENTS
// trap 4) — webbens lever-side kaller den samme kjernen gjennom sin
// server-action.
//
// AUTH: `lib/api/appAuth.ts`, den delte adgangssjekken for app→server-ruter.
// `Authorization: Bearer <access_token>` validert mot GoTrue; spill-id-en
// kommer KUN fra stien og bruker-id-en KUN fra tokenet.
//
// **Ingen arrangør-sjekk.** Dette er spillerens egen levering, og en
// `gameOrganiserAccess` hadde stengt ute nettopp dem ruta er for.
// Autorisasjonen er at kjernen er selv-avgrenset: den skriver kun raden der
// `user_id` = innsenderen, eller radene med samme `team_number` som
// innsenderens EGEN rad. Er kalleren ikke med i spillet, finnes ingen slik rad
// — kjernen svarer `not_player` og ruta 403.
//
// **Makkerne i samme levering (#2200).** Den som fører for flighten, leverer
// makkernes kort med det samme kallet: `alsoFor` er appens liste over dem.
// Klienten kan bare snevre inn. Kjernen spør selv leveringsregelen
// (`lib/games/flightDelivery.ts`) og leverer snittet; en id utenfor (annen
// flight, annet spill, kort som ikke er fullt) ignoreres uten feil. Uten kropp,
// eller uten `alsoFor`, er det en vanlig egen levering, slik installerte bygg
// alltid har kalt ruta.
//
// WIRE (frosset — appen speiler den):
//   POST [{ alsoFor: string[], markerUserId?: string }]   valgfri, 0–20 uuid-er
//        200 { submitted: number, alreadySubmitted: boolean, alsoDelivered: number }
//        400 { error: 'bad_request' }    kroppen er ikke JSON, eller `alsoFor` er feilformet
//        401 { error: 'unauthorized' }   403 { error: 'forbidden' }
//        404 { error: 'not_found' }      409 { error: 'not_active' }
//        412 { error: 'tee_shots_short' }   (#2580: someone on the team lacks tee shots)
//        422 { error: 'withdrawn' }      500 { error: 'submit_failed' }
//        428 { error: 'marker_required' | 'marker_is_self' | 'marker_not_member' }
//            (#2661: a simulator league needs a marker from the league)
//
// #2661: `markerUserId` (valgfri uuid) er markøren spilleren valgte i en
// simulatorliga. Utenfor simulatorligaen ignoreres den. Et bygg uten feltet
// får 428 i en simulatorliga, og en levering der uten markør skjer ikke.
//
// Ingen id fra body eller query identifiserer spillet eller kalleren. Den eneste
// id-lista i kroppen er `alsoFor`, og den kan bare snevre inn.
// 404 for et ukjent spill gjelder ALLE kallere, også en admin, så statusen
// ikke røper hvilke spill som finnes. `withdrawn` får sin egen status og ikke
// en andre 409, fordi appen leser KUN statusen for å velge melding.
//
// Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig
// eksponert, så `err.message` (Postgres-detaljer, env-navn) skal aldri ut.

// Leveringen er varsler (med push til dem som er utenfor appen) per levert kort
// og per attestant, pluss høyst én e-post (arrangørens «Alle har levert», #2203)
// i én rundtur. En flight med kortgodkjenning og treg push eller SMTP sprenger
// standard-taket. Eneste segment-eksporten repoet
// bruker — `dynamic`/`revalidate`/`runtime` er inkompatible med
// `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/games/[id]/submit-team';

/**
 * Kjernens grunner, oversatt til HTTP. Ett kart og ingen `default`: en ny grunn
 * i kjernen feller tsc her i stedet for å bli en stille 500.
 */
const FAILURE: Record<
  Extract<SubmitWithMarkerResult, { ok: false }>['reason'],
  { status: number; error: string }
> = {
  not_found: { status: 404, error: 'not_found' },
  not_active: { status: 409, error: 'not_active' },
  not_player: { status: 403, error: 'forbidden' },
  withdrawn: { status: 422, error: 'withdrawn' },
  // #2580: «Hvem sitt utslag» — a precondition the team has to meet first.
  tee_shots_short: { status: 412, error: 'tee_shots_short' },
  db: { status: 500, error: 'submit_failed' },
  // #2661: one status for the marker, so the app shows one message; the body
  // still names which check refused it.
  marker_required: { status: 428, error: 'marker_required' },
  marker_is_self: { status: 428, error: 'marker_is_self' },
  marker_not_member: { status: 428, error: 'marker_not_member' },
};

type RouteContext = { params: Promise<{ id: string }> };

/** En flight er aldri større enn dette; et lengre `alsoFor` er feilformet. */
const MAX_ALSO_FOR = 20;

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id: gameId } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const alsoFor = await readFlightIds(request.clone(), 'alsoFor', MAX_ALSO_FOR);
    const markerUserId = await readUuidField(request, 'markerUserId');
    if (!alsoFor || markerUserId === undefined) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const result = await submitScorecardWithMarker(getAdminClient(), gameId, userId, {
      alsoFor,
      markerUserId,
    });
    if (!result.ok) {
      const { status, error } = FAILURE[result.reason];
      return NextResponse.json({ error }, { status });
    }

    // `alreadySubmitted` og `alsoDelivered` styrer ordlyd i appen, ikke
    // suksess: 200 ER kvitteringen, også når kortet alt sto som levert.
    return NextResponse.json({
      submitted: result.submitted,
      alreadySubmitted: result.alreadySubmitted,
      alsoDelivered: result.alsoDelivered,
    });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] submit threw`, err);
    return NextResponse.json({ error: 'submit_failed' }, { status: 500 });
  }
}
