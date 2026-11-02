import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { revalidateCupSideAwards, saveSideAwardConfigCore } from '@/lib/cup/sideAwardCore';
import type { SideAwardConfigInput } from '@/lib/cup/sideAwardRows';
import { getAdminClient } from '@/lib/supabase/admin';

// Hvilke sidepoeng en cup har (#2752), samme kjerne som nettets
// `saveSideAwardConfig`. Bare mens cupen er utkast. Kroppen er den FULLE lista: det
// som ikke står der, fjernes. Registreringen etter runden har egne ruter under
// `side-awards/[awardId]`.
//
// WIRE:
//   PUT { awards: SideAwardConfigInput[] } 200 { ok: true } · 400 invalid_request
//       401 unauthorized · 403 not_manager · 404 not_found
//       409 invalid_side_award | duplicate_side_award | cup_started | cup_finished
//           | winners_already_registered
//       500 save_failed

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const { awards } = await jsonObject(request);
    if (!Array.isArray(awards)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    // Kjernen sjekker innholdet (`isValidSideAward`), men den leser felt på raden.
    if (!awards.every((award) => typeof award === 'object' && award !== null)) {
      return cupActionFailure('invalid_side_award', 'save_failed');
    }

    const result = await saveSideAwardConfigCore(getAdminClient(), {
      tournamentId: id,
      awards: awards as SideAwardConfigInput[],
    });
    if (!result.ok) return cupActionFailure(result.error, 'save_failed');

    revalidateCupSideAwards(id, gate.groupId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/[id]/side-awards] threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
