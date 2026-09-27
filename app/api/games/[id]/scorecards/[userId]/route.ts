import { NextResponse, type NextRequest } from 'next/server';
import {
  authenticatedUserId,
  scorecardReviewAccess,
  type ScorecardDecision,
  type ScorecardReviewAccess,
} from '@/lib/api/appAuth';
import { getAdminClient } from '@/lib/supabase/admin';
import {
  approveScorecardCore,
  rejectScorecardCore,
  reopenScorecardCore,
  type ReviewScorecardResult,
} from '@/lib/games/reviewScorecardCore';

// Godkjenn, avvis og åpne igjen et levert scorekort fra native-appen (#2215).
// Appen skrev disse tre rett mot PostgREST, og da gikk verken
// `scorecard_approved`, `scorecard_rejected` eller `scorecard_reopened` ut, og
// nettsidens spill-cache (`game-${id}`) sto med gammel status i opptil 15 min.
//
// Ruta er kun transport foran `lib/games/reviewScorecardCore.ts`. Skrivingen,
// 0-rads-oppløsningen, lagkort-kaskaden (#2213), varslene og cache-tømmingen
// bor der og speiles ALDRI her (AGENTS trap 4) — webbens /approve og
// arrangørens «Åpne for redigering» kaller de samme kjernene gjennom sine
// server-actions.
//
// AUTH: `lib/api/appAuth.ts`. `Authorization: Bearer <access_token>` validert
// mot GoTrue; spill-id-en og kortets eier kommer KUN fra stien, og kalleren KUN
// fra tokenet. Kjernen skriver med service-role, så vakt-triggerne no-op-er og
// RLS slipper alt gjennom: **`scorecardReviewAccess` er hele tilgangssjekken.**
// Den speiler webbens regler (attestant → `peer`, admin → `organizer`,
// oppretter som godkjenner en annens kort → `organizer`, arrangøren for
// `reopen`), og rollen går videre som `approver_role` i varselet.
//
// WIRE (appen speiler den; ruta og app-halvdelen endres i samme PR):
//   POST { decision: 'approve' | 'reject' | 'reopen', reason?: string }
//        200 { alreadyDone: boolean }
//        400 { error: 'bad_request' }    401 { error: 'unauthorized' }
//        403 { error: 'forbidden' }      404 { error: 'not_found' }
//        409 { error: 'not_active' }     422 { error: 'not_pending' }
//        500 { error: 'review_failed' }
//
// Kroppen bærer valget og grunnen — verdier, aldri identitet: en `gameId` eller
// `userId` i kroppen eller query-en leses ikke. `reason` brukes bare ved
// `reject`. 404 for et ukjent spill gjelder ALLE kallere, også en admin, så
// statusen ikke røper rollen. `alreadyDone` styrer ordlyd i appen, ikke suksess:
// 200 ER kvitteringen, også når kortet alt sto slik.
//
// Feil-bodyene er faste, ugjennomsiktige koder. Endepunktet er offentlig
// eksponert, så `err.message` (Postgres-detaljer, env-navn) skal aldri ut.

// En avvisning av et delt lagkort varsler hele laget (push + in-app per rad);
// samme tak som leveringen. `dynamic`/`revalidate`/`runtime` er inkompatible
// med `cacheComponents` (next.config.ts).
export const maxDuration = 60;

const LOG_PREFIX = 'api/games/[id]/scorecards/[userId]';

const DECISIONS: readonly ScorecardDecision[] = ['approve', 'reject', 'reopen'];

/**
 * Portens nei, oversatt til HTTP. Ett kart og ingen `default`: en ny grunn i
 * porten feller tsc her i stedet for å bli en stille 500.
 */
const REFUSAL: Record<
  Extract<ScorecardReviewAccess, { ok: false }>['reason'],
  { status: number; error: string }
> = {
  game_not_found: { status: 404, error: 'not_found' },
  not_active: { status: 409, error: 'not_active' },
  forbidden: { status: 403, error: 'forbidden' },
};

/** Kjernens nei. `reopen` har bare `db`, som er et delsett av disse. */
const FAILURE: Record<
  Extract<ReviewScorecardResult, { ok: false }>['reason'],
  { status: number; error: string }
> = {
  not_pending: { status: 422, error: 'not_pending' },
  db: { status: 500, error: 'review_failed' },
};

type RouteContext = { params: Promise<{ id: string; userId: string }> };

type Body = { decision: ScorecardDecision; reason: string };

/**
 * Kroppen, eller `null` når den ikke er gyldig: ugyldig JSON, en ukjent
 * `decision`, eller en `reason` som ikke er tekst.
 */
async function readBody(request: NextRequest): Promise<Body | null> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { decision, reason } = raw as { decision?: unknown; reason?: unknown };
  if (!DECISIONS.includes(decision as ScorecardDecision)) return null;
  if (reason !== undefined && typeof reason !== 'string') return null;
  return { decision: decision as ScorecardDecision, reason: reason ?? '' };
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id: gameId, userId: playerUserId } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await readBody(request);
    if (!body) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const access = await scorecardReviewAccess(
      userId,
      gameId,
      playerUserId,
      body.decision,
    );
    if (!access.ok) {
      const { status, error } = REFUSAL[access.reason];
      return NextResponse.json({ error }, { status });
    }

    const admin = getAdminClient();
    let result: ReviewScorecardResult;
    switch (body.decision) {
      case 'approve':
        result = await approveScorecardCore({
          client: admin,
          gameId,
          approverUserId: userId,
          playerUserId,
          approverRole: access.role,
        });
        break;
      case 'reject':
        result = await rejectScorecardCore({
          client: admin,
          gameId,
          gameMode: access.gameMode,
          rejecterUserId: userId,
          playerUserId,
          rawReason: body.reason,
        });
        break;
      case 'reopen': {
        // Rått profilnavn til varselet, aldri en norsk «Admin»-reserve: kortet
        // fyller reserven i MOTTAKERENS locale (#1598). Et navn som ikke lar
        // seg lese gir samme reserve, så feilen stopper ikke gjenåpningen.
        const { data: actor } = await admin
          .from('users')
          .select('name')
          .eq('id', userId)
          .maybeSingle<{ name: string | null }>();
        result = await reopenScorecardCore({
          client: admin,
          gameId,
          gameMode: access.gameMode,
          gameName: access.gameName,
          actorName: actor?.name?.trim() || null,
          playerUserId,
        });
        break;
      }
    }

    if (!result.ok) {
      const { status, error } = FAILURE[result.reason];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({ alreadyDone: result.alreadyDone });
  } catch (err) {
    console.error(`[${LOG_PREFIX}] review threw`, err);
    return NextResponse.json({ error: 'review_failed' }, { status: 500 });
  }
}
