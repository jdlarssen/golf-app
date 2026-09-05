import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  submitScorecardCore,
  type SubmitScorecardResult,
} from '@/lib/games/submitScorecardCore';

// Levering av lagkort fra native-appen (#1918). I formatene som kollapser til
// ett lagkort (scramble-familien + alternate-shot-matchplay) markerer én
// levering HELE lagets aktive, uleverte rader — og RLS lar en spiller bare
// skrive sin egen rad. Appen har ingen service-role, så uten denne ruta kunne
// laget føres i appen, men bare leveres på nettsiden.
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
// WIRE (frosset — appen speiler den):
//   POST 200 { submitted: number, alreadySubmitted: boolean }
//        401 { error: 'unauthorized' }   403 { error: 'forbidden' }
//        404 { error: 'not_found' }      409 { error: 'not_active' }
//        422 { error: 'withdrawn' }      500 { error: 'submit_failed' }
//
// Ingen body, ingen query — verken spill-id eller bruker-id leses derfra.
// 404 for et ukjent spill gjelder ALLE kallere, også en admin, så statusen
// ikke røper hvilke spill som finnes. `withdrawn` får sin egen status og ikke
// en andre 409, fordi appen leser KUN statusen for å velge melding.
//
// Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig
// eksponert, så `err.message` (Postgres-detaljer, env-navn) skal aldri ut.

// Leveringen er varsler + N admin-mail i én rundtur; et lag i en klubb-runde
// med treg SMTP sprenger standard-taket. Eneste segment-eksporten repoet
// bruker — `dynamic`/`revalidate`/`runtime` er inkompatible med
// `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/games/[id]/submit-team';

/**
 * Kjernens grunner, oversatt til HTTP. Ett kart og ingen `default`: en ny grunn
 * i kjernen feller tsc her i stedet for å bli en stille 500.
 */
const FAILURE: Record<
  Extract<SubmitScorecardResult, { ok: false }>['reason'],
  { status: number; error: string }
> = {
  not_found: { status: 404, error: 'not_found' },
  not_active: { status: 409, error: 'not_active' },
  not_player: { status: 403, error: 'forbidden' },
  withdrawn: { status: 422, error: 'withdrawn' },
  db: { status: 500, error: 'submit_failed' },
};

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id: gameId } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const result = await submitScorecardCore(getAdminClient(), gameId, userId);
    if (!result.ok) {
      const { status, error } = FAILURE[result.reason];
      return NextResponse.json({ error }, { status });
    }

    // `alreadySubmitted` styrer ordlyd i appen, ikke suksess: 200 ER
    // kvitteringen, også når kortet alt sto som levert.
    return NextResponse.json({
      submitted: result.submitted,
      alreadySubmitted: result.alreadySubmitted,
    });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] submit threw`, err);
    return NextResponse.json({ error: 'submit_failed' }, { status: 500 });
  }
}
