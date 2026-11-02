import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { jsonObject } from '@/lib/cup/cupRouteGate';
import { setCupPlannedMatchCountCore } from '@/lib/cup/lineupCore';
import { lineupAccessFor, lineupAnswer } from '@/lib/cup/lineupRoute';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren sier hvor mange kamper cupen skal ha totalt (#2752), med samme kjerne som nettet.
//
// WIRE: PUT { plannedMatchCount }
//   200 { ok: true } · 401 unauthorized · 403 not_allowed · 404 not_found
//   409 lineup_planned_total | too_many_matches | cup_finished
//       | planned_saved_target_failed (tallet ER lagret, lagre en gang til)
//   500 save_failed

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const body = await jsonObject(request);
    return lineupAnswer(
      await setCupPlannedMatchCountCore(lineupAccessFor(userId), {
        tournamentId: id,
        plannedRaw: String(body.plannedMatchCount ?? ''),
      }),
    );
  } catch (err) {
    console.error('[api/cup/planned-match-count] threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
