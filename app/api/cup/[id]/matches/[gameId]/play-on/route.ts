import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { revalidateCup, setFourballWithdrawalChoiceCore } from '@/lib/cup/withdrawalCore';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren velger om makkeren spiller alene (#2752), samme kjerne som nettet.
// Kjernen sjekker at kampen hører til denne cupen.
//
// WIRE:
//   POST { playOn: boolean } 200 { ok: true } · 400 invalid_request
//     401 unauthorized · 403 not_manager · 404 not_found · 409 regelens kode
//     500 withdraw_failed

type RouteContext = { params: Promise<{ id: string; gameId: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, gameId } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;
    if (!isUuid(gameId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const body = await jsonObject(request);
    if (typeof body.playOn !== 'boolean') {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const result = await setFourballWithdrawalChoiceCore(getAdminClient(), {
      tournamentId: id,
      gameId,
      playOn: body.playOn,
    });
    if ('error' in result) return cupActionFailure(result.error, 'withdraw_failed');

    revalidateCup(id, gate.groupId, [gameId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/[id]/matches/[gameId]/play-on] threw', err);
    return NextResponse.json({ error: 'withdraw_failed' }, { status: 500 });
  }
}
