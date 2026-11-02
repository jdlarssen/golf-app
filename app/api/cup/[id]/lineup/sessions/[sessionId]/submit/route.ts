import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { jsonObject } from '@/lib/cup/cupRouteGate';
import { submitCupLineupCore } from '@/lib/cup/lineupCore';
import { lineupAccessFor, lineupAnswer } from '@/lib/cup/lineupRoute';
import { lineupSlotsFrom } from '@/lib/cup/lineupValidation';
import { isUuid } from '@/lib/url/isUuid';

// Kapteinen leverer uttaket for eget lag, og arrangøren kan levere for begge (#2752). Er
// begge inne etterpå, settes kampene opp i samme kall. `canWriteTeamLineup` i kjernen er det
// som hindrer en kaptein i å skrive motstanderens lag.
//
// WIRE: POST { team: 1 | 2, slots: [{ slotIndex, userIds }] }
//   200 { ok: true } · 401 unauthorized · 403 not_allowed · 404 not_found
//   409 lineup_revealed | lineup_already_submitted | lineup_slot_shape | lineup_incomplete
//       | lineup_duplicate_player | lineup_not_in_squad | lineup_squad_changed
//       | lineup_not_both_submitted | missing_plan | plan_tee | cup_finished
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

    const body = await jsonObject(request);
    return lineupAnswer(
      await submitCupLineupCore(lineupAccessFor(userId), {
        tournamentId: id,
        sessionId,
        team: body.team === 1 || body.team === 2 ? body.team : null,
        slots: lineupSlotsFrom(body.slots),
      }),
    );
  } catch (err) {
    console.error('[api/cup/lineup/submit] threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
