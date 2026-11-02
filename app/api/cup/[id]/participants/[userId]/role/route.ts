import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { jsonObject } from '@/lib/cup/cupRouteGate';
import { setCupParticipantRoleCore } from '@/lib/cup/lineupCore';
import { lineupAccessFor, lineupAnswer } from '@/lib/cup/lineupRoute';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren setter lag og kaptein på deltakerlista (#2752), med samme kjerne som nettet.
//
// WIRE: POST { teamNumber: 1 | 2 | null, isCaptain: boolean }
//   200 { ok: true } · 401 unauthorized · 403 not_allowed · 404 not_found
//   409 not_participant | captain_needs_team | team_taken | invalid_team
//   500 save_failed

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, userId: target } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id) || !isUuid(target)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const body = await jsonObject(request);
    const team = body.teamNumber;
    if (team !== 1 && team !== 2 && team !== null) {
      return lineupAnswer({ error: 'invalid_team' });
    }
    return lineupAnswer(
      await setCupParticipantRoleCore(lineupAccessFor(userId), {
        tournamentId: id,
        userId: target,
        teamNumber: team,
        isCaptain: body.isCaptain === true,
      }),
    );
  } catch (err) {
    console.error('[api/cup/participants/role] threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
