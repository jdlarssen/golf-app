import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { registerSideAwardWinnerCore, revalidateCupSideAwards } from '@/lib/cup/sideAwardCore';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren registrerer vinneren på ett sidepoeng (#2752), samme kjerne som nettet.
// `winnerUserId: null` er «ingen kvalifiserte». Virker også etter at cupen er
// avsluttet, og da regnes vinneren av cupen på nytt.
//
// WIRE:
//   POST { winnerUserId: string | null } 200 { ok: true } · 400 invalid_request
//     401 unauthorized · 403 not_manager · 404 not_found
//     409 not_a_participant · 500 save_failed

type RouteContext = { params: Promise<{ id: string; awardId: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, awardId } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;
    if (!isUuid(awardId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const { winnerUserId } = await jsonObject(request);
    if (winnerUserId !== null && (typeof winnerUserId !== 'string' || !isUuid(winnerUserId))) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const result = await registerSideAwardWinnerCore(getAdminClient(), {
      tournamentId: id,
      awardId,
      winnerUserId,
    });
    if (!result.ok) return cupActionFailure(result.error, 'save_failed');

    revalidateCupSideAwards(id, gate.groupId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/[id]/side-awards/[awardId]/winner] threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
