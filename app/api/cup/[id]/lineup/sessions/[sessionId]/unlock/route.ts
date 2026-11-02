import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { jsonObject } from '@/lib/cup/cupRouteGate';
import { unlockCupLineupCore } from '@/lib/cup/lineupCore';
import { lineupAccessFor, lineupAnswer } from '@/lib/cup/lineupRoute';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren låser opp et levert uttak før avdekking (#2752), med samme kjerne som nettet.
// Kladden står, så kapteinen retter og leverer på nytt.
//
// WIRE: POST { team: 1 | 2 }
//   200 { ok: true } · 401 unauthorized · 403 not_allowed · 404 not_found
//   409 lineup_revealed · 500 save_failed

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, sessionId } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id) || !isUuid(sessionId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const body = await jsonObject(request);
    return lineupAnswer(
      await unlockCupLineupCore(lineupAccessFor(userId), {
        tournamentId: id,
        sessionId,
        team: body.team === 1 || body.team === 2 ? body.team : null,
      }),
    );
  } catch (err) {
    console.error('[api/cup/lineup/unlock] threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
