import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { retryCupLineupRevealCore } from '@/lib/cup/lineupCore';
import { lineupAccessFor, lineupAnswer } from '@/lib/cup/lineupRoute';
import { isUuid } from '@/lib/url/isUuid';

// Arrangørens «Prøv igjen» på en økt der begge har levert, men kampene mangler (#2752).
// Samme kjerne som nettet, og `revealed_at` klemmes betinget, så det aldri blir to sett kamper.
//
// WIRE: POST
//   200 { ok: true } · 401 unauthorized · 403 not_allowed · 404 not_found
//   409 lineup_revealed | lineup_not_both_submitted | lineup_squad_changed | missing_plan
//       | plan_tee | cup_finished
//   500 save_failed | insert_failed | profile_read_failed | rollback_failed | reveal_undo_failed

// Avdekkingen skriver kamp for kamp, og rollbacken overlever ikke et tidsavbrudd (#1894).
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, sessionId } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id) || !isUuid(sessionId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return lineupAnswer(await retryCupLineupRevealCore(lineupAccessFor(userId), { tournamentId: id, sessionId }));
  } catch (err) {
    console.error('[api/cup/lineup/reveal] threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
