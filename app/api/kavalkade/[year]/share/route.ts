import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { logKavalkadeShareFor } from '@/lib/kavalkade/logKavalkadeShare';

// Del-tellingen for native-appen (#2265) — appens tvilling av webbens
// server-action `logKavalkadeShare` (`app/[locale]/kavalkade/shareActions.ts`).
//
// Begge kaller samme kjerne, `logKavalkadeShareFor` i
// `lib/kavalkade/logKavalkadeShare.ts`: kort-sjekken, skrivingen med
// service-rollen og `expectOne` (felle 2) bor der. Ruta oversetter bare svaret
// til HTTP, og 400-koden er kjernens egen `unknown_card` — samme kode actionen
// gir.
//
// AUTH: `authenticatedUserId` i `lib/api/appAuth.ts`. Bruker-id-en kommer KUN
// fra det validerte tokenet; en `userId` i kroppen ignoreres. En klient kan
// altså bare telle sine EGNE delinger, og desember-tallet i #1040 kan ikke
// blåses opp med et POST-kall.
//
// WIRE (frosset — appen speiler den):
//   POST { cardKind: string }
//        200 { ok: true }
//        400 { error: 'unknown_card' }
//        401 { error: 'unauthorized' }
//        500 { error: 'db_error' }
//
// Året kommer fra stien. Et år som ikke er et helt tall, en ukjent kort-slug
// og en kropp som ikke lar seg lese gir alle 400 `unknown_card`, slik actionen
// svarer på det samme. Feil-bodyene er faste koder, aldri `err.message`.
//
// `maxDuration` settes IKKE: én innsetting.

const LOG_PREFIX = 'api/kavalkade/[year]/share';

type RouteContext = { params: Promise<{ year: string }> };

type ErrorBody = { error: 'unauthorized' | 'unknown_card' | 'db_error' };

/**
 * `cardKind` fra kroppen, eller tom streng når den mangler.
 *
 * En uleselig kropp er en KLIENT-feil: den faller gjennom som manglende kort,
 * og kjernen svarer `unknown_card` — ikke en 500 for noe kalleren sendte feil.
 */
async function readCardKind(request: NextRequest): Promise<string> {
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== 'object') return '';
    const { cardKind } = parsed as { cardKind?: unknown };
    return typeof cardKind === 'string' ? cardKind : '';
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { year } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) {
      const body: ErrorBody = { error: 'unauthorized' };
      return NextResponse.json(body, { status: 401 });
    }

    const result = await logKavalkadeShareFor(
      userId,
      Number(year),
      await readCardKind(request),
    );
    if (result.ok) return NextResponse.json({ ok: true });

    if (result.error === 'unknown_card') {
      const body: ErrorBody = { error: 'unknown_card' };
      return NextResponse.json(body, { status: 400 });
    }
    // Kjernen har allerede logget skrivefeilen.
    const body: ErrorBody = { error: 'db_error' };
    return NextResponse.json(body, { status: 500 });
  } catch (err) {
    // Kjernen kaster aldri; dette er token-valideringen
    // (`getAdminClient()` uten service-nøkkel).
    console.error(`[${LOG_PREFIX}] share threw`, err);
    const body: ErrorBody = { error: 'db_error' };
    return NextResponse.json(body, { status: 500 });
  }
}
