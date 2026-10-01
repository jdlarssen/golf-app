import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getOrCreateKavalkade } from '@/lib/kavalkade/getOrCreateKavalkade';
import { KAVALKADE_YEAR } from '@/lib/kavalkade/release';

// Kavalkaden for native-appen (#2265) — appens tvilling av
// `app/[locale]/kavalkade/[year]/page.tsx`.
//
// Ruta gjør det samme som siden: én `getOrCreateKavalkade(userId)` og svaret
// rett ut. `KavalkadeView` sendes som den er, så de tre tilstandene har ett
// hjem — `closed` før datoen, `preview` for admin før datoen, `ready` med den
// lagrede raden. Første åpning etter datoen bygger raden og kaller modellen,
// akkurat som på webben; deretter leses den lagrede raden.
//
// Andre år enn `KAVALKADE_YEAR` finnes ikke (samme regel som siden), og
// svares 404 før tokenet sjekkes, slik siden svarer `notFound()` før den
// sender til innlogging.
//
// AUTH: `authenticatedUserId` i `lib/api/appAuth.ts`. Bruker-id-en kommer KUN
// fra det validerte tokenet — det er den `getOrCreateKavalkade` stoler på.
//
// WIRE (frosset — appen speiler den):
//   GET 200 { status: 'ready', facts, narrative: string | null, generatedAt }
//       200 { status: 'preview', facts }
//       200 { status: 'closed', opensAt }
//       401 { error: 'unauthorized' }
//       404 { error: 'not_found' }
//       500 { error: 'load_failed' }
//
// `facts` er `KavalkadeFacts` (`lib/kavalkade/buildKavalkadeFacts.ts`), samme
// form som lagres i `kavalkades.facts`. Feil-bodyene er faste koder, aldri
// `err.message`.

// Første åpning venter på språkmodellen FØR raden skrives (advarselen i
// `getOrCreateKavalkade`). Uten denne kan plattformen kutte kallet midtveis, og
// spilleren står igjen uten rad og betaler et nytt modellkall neste gang.
// Eneste segment-eksporten repoet bruker; `runtime` er inkompatibel med
// `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/kavalkade/[year]';

type RouteContext = { params: Promise<{ year: string }> };

type ErrorBody = { error: 'unauthorized' | 'not_found' | 'load_failed' };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { year } = await ctx.params;
    if (Number(year) !== KAVALKADE_YEAR) {
      const body: ErrorBody = { error: 'not_found' };
      return NextResponse.json(body, { status: 404 });
    }

    const userId = await authenticatedUserId(request);
    if (!userId) {
      const body: ErrorBody = { error: 'unauthorized' };
      return NextResponse.json(body, { status: 401 });
    }

    return NextResponse.json(await getOrCreateKavalkade(userId));
  } catch (err) {
    console.error(`[${LOG_PREFIX}] load failed`, err);
    const body: ErrorBody = { error: 'load_failed' };
    return NextResponse.json(body, { status: 500 });
  }
}
