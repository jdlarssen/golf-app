import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, gameOrganiserAccess } from '@/lib/api/appAuth';
import {
  notifyRosterInvites,
  type NotifyRosterInvitesResult,
} from '@/lib/games/notifyRosterInvites';

// `invite`-varsel til rosteret etter at native-appen har publisert en runde
// (#2215). Appen oppretter runden selv under RLS, men kan ikke varsle, så
// medspillerne fikk aldri vite at de var med før de åpnet appen.
//
// Ruta er kun transport foran `lib/games/notifyRosterInvites.ts`. Hvem som
// varsles (ikke kalleren, ikke gjester, ikke trukne, ikke dem som alt har et
// `invite`-varsel for runden) og cache-tømmingen bor der og speiles ALDRI her
// (AGENTS trap 4).
//
// AUTH: `lib/api/appAuth.ts`, den delte adgangssjekken for app→server-ruter.
// `Authorization: Bearer <access_token>` validert mot GoTrue; bruker-id-en
// kommer KUN fra tokenet og spill-id-en KUN fra stien. Bare arrangøren
// (oppretter eller admin) kan be om utsendingen: kjernen leser og varsler med
// service-role, så porten under er den eneste tilgangssjekken.
//
// WIRE (appen speiler den):
//   POST (ingen kropp)
//     200 { invited: number }
//     401 { error: 'unauthorized' }   403 { error: 'forbidden' }
//     404 { error: 'not_found' }      409 { error: 'game_locked' }
//     500 { error: 'invite_failed' }
//
// Kallet er idempotent: et nytt forsøk etter et nettbrudd gir `invited: 0` for
// dem som alt fikk varselet. 404 for et ukjent spill gjelder ALLE kallere, også
// en admin, så statusen ikke røper roller. Feil-bodyene er faste,
// ugjennomsiktige koder: endepunktet er offentlig eksponert, så `err.message`
// (Postgres-detaljer, env-navn) skal aldri ut.
//
// `maxDuration = 60`: én push-rundtur per spiller, og en klubb-runde kan ha
// mange. Eneste segment-eksporten repoet bruker — `dynamic`/`revalidate`/
// `runtime` er inkompatible med `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/games/[id]/invite-roster';

/**
 * Kjernens avvisninger, oversatt til HTTP. Ett kart og ingen `default`: en ny
 * grunn i kjernen feller tsc her i stedet for å bli en stille 500.
 */
const REFUSAL: Record<
  Extract<NotifyRosterInvitesResult, { ok: false }>['reason'],
  { status: number; error: string }
> = {
  not_found: { status: 404, error: 'not_found' },
  game_locked: { status: 409, error: 'game_locked' },
};

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

    const result = await notifyRosterInvites({ gameId, inviterUserId: userId });
    if (!result.ok) {
      const { status, error } = REFUSAL[result.reason];
      return NextResponse.json({ error }, { status });
    }

    return NextResponse.json({ invited: result.invited });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] invite-roster threw`, err);
    return NextResponse.json({ error: 'invite_failed' }, { status: 500 });
  }
}
