import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, gameOrganiserAccess } from '@/lib/api/appAuth';
import { previewReminder, sendReminders } from '@/lib/games/remindUnsubmitted';

// Purring fra native-appen (#1889/#1891). Arrangøren står på avslutt-skjermen,
// noen mangler kort — uten denne ruta var eneste vei videre å merke dem som
// trukket, altså en destruktiv handling presentert som eneste alternativ.
//
// Ruta er kun transport foran `lib/games/remindUnsubmitted.ts`. Målregelen,
// sendingen og stemplingen bor der og speiles ALDRI her (AGENTS trap 4) —
// webbens status-side kaller den samme kjernen gjennom sin server-action.
//
// AUTH: `lib/api/appAuth.ts`, den delte adgangssjekken for app→server-ruter.
// `Authorization: Bearer <access_token>` validert mot GoTrue; spill-id-en
// kommer KUN fra stien og bruker-id-en KUN fra tokenet, så det finnes ingen
// vei til å purre i en annens runde. Kjernen har ingen egen authz — porten
// under ER håndhevelsen.
//
// WIRE (frosset — appen speiler den):
//   GET  200 { targets: number, lastRemindedAt: string | null }
//   POST 200 { reminded: number }
//        401 { error: 'unauthorized' }   403 { error: 'forbidden' }
//        404 { error: 'not_found' }      409 { error: 'not_active' }
//        500 { error: 'remind_failed' }
//
// Ingen body, ingen query. 404 skiller «spillet finnes ikke» fra 403 «du er
// ikke arrangør her» (Claude's Discretion i kontrakten): et ukjent spill svares
// som ukjent for ALLE kallere, også en admin, så statusen ikke røper roller.
//
// Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig
// eksponert, så `err.message` (Postgres-detaljer, env-navn) skal aldri ut.

// Purring er N mail + N push i én rundtur; 18 spillere med treg SMTP sprenger
// standard-taket. Eneste segment-eksporten repoet bruker — `dynamic`/
// `revalidate`/`runtime` er inkompatible med `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/games/[id]/remind';

/** Kjernens blokkerings-grunner, oversatt til HTTP. */
const BLOCKED_STATUS = { not_found: 404, not_active: 409 } as const;

type RouteContext = { params: Promise<{ id: string }> };

type Gate =
  | { ok: true; gameId: string }
  | { ok: false; response: NextResponse };

/**
 * Porten begge verbene deler: hvem ringer, og har hen noe her å gjøre?
 *
 * Én kropp og ikke to, fordi et avvik mellom GET-ens og POST-ens gate er
 * nøyaktig den feilen som ikke synes — GET-en ville lekket antall spillere som
 * mangler levering i en fremmed runde.
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

  const access = await gameOrganiserAccess(userId, gameId);
  if (access === 'game_not_found') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'not_found' }, { status: 404 }),
    };
  }
  if (access === 'not_organiser') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    };
  }

  return { ok: true, gameId };
}

/** Hvor mange purringen ville truffet nå — knappens tall, uten å sende noe. */
export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const gated = await gate(request, ctx);
    if (!gated.ok) return gated.response;

    const result = await previewReminder(gated.gameId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason },
        { status: BLOCKED_STATUS[result.reason] },
      );
    }

    return NextResponse.json({
      targets: result.targets,
      lastRemindedAt: result.lastRemindedAt,
    });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] preview failed`, err);
    return NextResponse.json({ error: 'remind_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const gated = await gate(request, ctx);
    if (!gated.ok) return gated.response;

    const result = await sendReminders(gated.gameId);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason },
        { status: BLOCKED_STATUS[result.reason] },
      );
    }

    // `reminded` er antall MÅL, ikke antall leverte mail: mail og push er
    // best-effort i kjernen, og én død adresse skal ikke bli en 500 som får
    // arrangøren til å purre om igjen.
    return NextResponse.json({ reminded: result.reminded });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] remind threw`, err);
    return NextResponse.json({ error: 'remind_failed' }, { status: 500 });
  }
}
