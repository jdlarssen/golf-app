import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import {
  undoSelfWithdraw,
  withdrawSelf,
  type SelfWithdrawError,
} from '@/lib/games/withdrawSelf';

// Selv-frafall fra native-appen (#1917). Arrangøren sto på egen rad i
// arrangør-seksjonen og på avslutt-skjermen og leste «det gjør du på nettsiden»
// — en setning der handlingen skulle stått.
//
// Ruta er kun transport foran `lib/games/withdrawSelf.ts`. Hvilken gren som
// gjelder (mykt trekk vs. sletting), cup-sperren, varselet til kapteinen og
// cache-utløpingen bor der og speiles ALDRI her (AGENTS trap 4) — webbens
// `/games/[id]/trekk-fra` kaller den samme kjernen gjennom sin server-action.
//
// AUTH: `lib/api/appAuth.ts`, den delte adgangssjekken for app→server-ruter.
// `Authorization: Bearer <access_token>` validert mot GoTrue.
//
// **Porten er `authenticatedUserId` ALENE, og det er nok.** Handlingen er per
// definisjon på kallerens egen rad: bruker-id-en kommer utelukkende fra det
// validerte tokenet, spill-id-en utelukkende fra stien, og kjernen filtrerer
// hver lesing og skriving på `(gameId, userId)`. Det finnes altså ingen id å
// bytte ut — hverken i en kropp eller i en query, som ruta ikke leser. Derfor
// ingen `gameOrganiserAccess` her: en spiller trekker seg fra sin egen runde,
// ikke fra en annens.
//
// Dette ER autorisasjonsargumentet. Det finnes ingen RLS bak ruta — kjernen
// skriver med service-role, fordi `guard_game_players_self_update` vakt (c)
// (0147/0168) nekter en ikke-admin å røre `withdrawn_at` på sin egen rad. Vakta
// er grunnen til at ruta finnes, og den skal stå.
//
// WIRE (frosset — appen speiler den):
//   POST   200 { ok: true, kept: boolean }   ← trekk deg
//   DELETE 200 { ok: true, kept: true }      ← angre
//          401 { error: 'unauthorized' }     403 { error: 'not_registered' }
//          404 { error: 'not_found' }        409 { error: 'game_locked' }
//          500 { error: 'withdraw_failed' }
//
// Ingen body, ingen query. Ett verb per handling på ÉN sti, som purringen: en
// kropp som bærer kommandoer bryter doktrinen i `native/app/src/data/webApi.ts`
// (kroppen bærer verdier, aldri identitet eller kommandoer).
//
// Én status = én kode, så appen slipper å lese `error`-feltet. Derfor svares
// `not_registered` som 403 og ikke som 404: 404 betyr «spillet finnes ikke».
//
// `maxDuration` settes IKKE. Purringen trenger 60 s for N mail; her er det maks
// ett `notify()`, og standard-taket holder.

const LOG_PREFIX = 'api/games/[id]/withdraw-self';

/** Kjernens feilkoder, oversatt til HTTP. Uttømmende — ny kode faller på tsc. */
const ERROR_STATUS: Record<SelfWithdrawError, number> = {
  not_registered: 403,
  game_not_found: 404,
  game_locked: 409,
  db_error: 500,
};

/**
 * Wire-koden per feil. `db_error` blir `withdraw_failed`, samme kode som et
 * uventet kast: begge er «dette gikk ikke, prøv igjen», og appen trenger ikke
 * et valg den ikke kan handle på.
 */
const ERROR_CODE: Record<SelfWithdrawError, string> = {
  not_registered: 'not_registered',
  game_not_found: 'not_found',
  game_locked: 'game_locked',
  db_error: 'withdraw_failed',
};

type RouteContext = { params: Promise<{ id: string }> };

type Gate =
  | { ok: true; gameId: string; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Porten begge verbene deler: hvem ringer, og hvilken runde gjelder det?
 *
 * Én kropp og ikke to, av samme grunn som i purringen: et avvik mellom POST-ens
 * og DELETE-ens gate er nøyaktig den feilen som ikke synes.
 */
async function gate(request: NextRequest, ctx: RouteContext): Promise<Gate> {
  const { id: gameId } = await ctx.params;

  const userId = await authenticatedUserId(request);
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }

  return { ok: true, gameId, userId };
}

function refusal(error: SelfWithdrawError): NextResponse {
  return NextResponse.json(
    { error: ERROR_CODE[error] },
    { status: ERROR_STATUS[error] },
  );
}

/** Trekk deg selv fra runden. */
export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const gated = await gate(request, ctx);
    if (!gated.ok) return gated.response;

    const result = await withdrawSelf(gated.gameId, gated.userId);
    if (!result.ok) return refusal(result.error);

    return NextResponse.json({ ok: true, kept: result.kept });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] withdraw threw`, err);
    return NextResponse.json({ error: 'withdraw_failed' }, { status: 500 });
  }
}

/** Angre frafallet. */
export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const gated = await gate(request, ctx);
    if (!gated.ok) return gated.response;

    const result = await undoSelfWithdraw(gated.gameId, gated.userId);
    if (!result.ok) return refusal(result.error);

    return NextResponse.json({ ok: true, kept: result.kept });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] undo threw`, err);
    return NextResponse.json({ error: 'withdraw_failed' }, { status: 500 });
  }
}
