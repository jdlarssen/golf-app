import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { deleteCupLineupSessionCore } from '@/lib/cup/lineupCore';
import { lineupAccessFor, lineupAnswer } from '@/lib/cup/lineupRoute';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren sletter en økt før den er avdekket (#2752), med samme kjerne som nettet.
//
// WIRE: DELETE
//   200 { ok: true } · 401 unauthorized · 403 not_allowed · 404 not_found · 500 save_failed
//   Som på nettet svarer en avdekket økt 200 og står urørt. Skjermen leser på nytt.

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, sessionId } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id) || !isUuid(sessionId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return lineupAnswer(await deleteCupLineupSessionCore(lineupAccessFor(userId), { tournamentId: id, sessionId }));
  } catch (err) {
    console.error('[api/cup/lineup/sessions/[sessionId]] threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
