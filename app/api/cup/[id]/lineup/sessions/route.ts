import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { jsonObject } from '@/lib/cup/cupRouteGate';
import { openCupLineupSessionCore } from '@/lib/cup/lineupCore';
import { lineupAccessFor, lineupAnswer } from '@/lib/cup/lineupRoute';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren åpner en økt (#2752), med samme kjerne som nettet.
//
// WIRE: POST { format, slotCount }
//   200 { ok: true } · 401 unauthorized · 403 not_allowed · 404 not_found
//   409 lineup_format | lineup_slot_count | lineup_planned_total_missing
//       | lineup_squad_too_small | too_many_matches | cup_finished
//   500 save_failed

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const body = await jsonObject(request);
    return lineupAnswer(
      await openCupLineupSessionCore(lineupAccessFor(userId), {
        tournamentId: id,
        format: String(body.format ?? ''),
        slotCount: Number(body.slotCount),
      }),
    );
  } catch (err) {
    console.error('[api/cup/lineup/sessions] threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
