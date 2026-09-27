import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';
import {
  submitScorecardCore,
  type SubmitScorecardResult,
} from '@/lib/games/submitScorecardCore';

// Levering for flighten fra native-appen (#2200). Den som fører, leverer
// makkernes kort sammen med sitt eget med ett trykk: dem hen har ført alle
// hullene for, og gjester i flighten. Appen har ingen service-role og
// sender ikke varsler selv, så leveringen går gjennom serveren, som for
// lagkortene i `submit-team`.
//
// Ruta er kun transport foran `lib/games/submitScorecardCore.ts`. Hvem som kan
// leveres, bor i `lib/games/flightDelivery.ts` og speiles ALDRI her (AGENTS
// trap 4). Webbens lever-side kaller den samme kjernen gjennom sin
// server-action.
//
// AUTH: `lib/api/appAuth.ts`, den delte adgangssjekken for app→server-ruter.
// `Authorization: Bearer <access_token>` validert mot GoTrue; spill-id-en
// kommer KUN fra stien og bruker-id-en KUN fra tokenet.
//
// **Klienten kan bare snevre inn.** `alsoFor` er appens liste over makkere.
// Kjernen spør selv leveringsregelen og leverer snittet; en id utenfor
// (annen flight, annet spill, kort som ikke er fullt) ignoreres uten feil.
// Kjernen kalles med admin-klienten, så TS-regelen er porten her, som i
// submit-team. Er kalleren ikke med i spillet, finnes ingen egen rad, og
// kjernen svarer `not_player` → 403.
//
// WIRE (frosset — appen speiler den):
//   POST { alsoFor: string[] }   0–20 uuid-er
//   200 { submitted: number, alreadySubmitted: boolean, alsoDelivered: number }
//   400 { error: 'bad_request' }    feilformet kropp
//   401 { error: 'unauthorized' }   403 { error: 'forbidden' }
//   404 { error: 'not_found' }      409 { error: 'not_active' }
//   422 { error: 'withdrawn' }      500 { error: 'submit_failed' }
//
// Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig
// eksponert, så `err.message` (Postgres-detaljer, env-navn) skal aldri ut.

// Leveringen er varsler + N admin-mail per kort i én rundtur. Eneste
// segment-eksporten repoet bruker — `dynamic`/`revalidate`/`runtime` er
// inkompatible med `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/games/[id]/submit-flight';

/** En flight er aldri større enn dette; et lengre `alsoFor` er feilformet. */
const MAX_ALSO_FOR = 20;

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

/**
 * `alsoFor` fra kroppen, eller `null` når kroppen er feilformet. En uleselig
 * kropp er en KLIENT-feil (400), ikke «vi feilet» (500) — samme vakt som
 * invite- og profil-ruta.
 */
async function readAlsoFor(request: NextRequest): Promise<string[] | null> {
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== 'object') return null;
    const alsoFor = (parsed as { alsoFor?: unknown }).alsoFor;
    if (!Array.isArray(alsoFor) || alsoFor.length > MAX_ALSO_FOR) return null;
    if (!alsoFor.every((id) => typeof id === 'string' && isUuid(id))) return null;
    return alsoFor;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id: gameId } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const alsoFor = await readAlsoFor(request);
    if (!alsoFor) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const result = await submitScorecardCore(getAdminClient(), gameId, userId, {
      alsoFor,
    });
    if (!result.ok) {
      const { status, error } = FAILURE[result.reason];
      return NextResponse.json({ error }, { status });
    }

    // `alreadySubmitted` styrer ordlyd i appen, ikke suksess: 200 ER
    // kvitteringen, også når ingenting nytt ble levert.
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
