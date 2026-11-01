import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { revalidateCup, undoCupWithdrawalCore } from '@/lib/cup/withdrawalCore';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren angrer et trekk (#2752), samme kjerne som nettet. Bare arrangøren
// kan angre, og bare for kamper som ikke har startet.
//
// WIRE:
//   POST { userId } 200 { ok: true } · 400 invalid_request · 401 unauthorized
//     403 not_manager · 404 not_found · 409 regelens kode · 500 withdraw_failed

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const body = await jsonObject(request);
    if (typeof body.userId !== 'string' || !isUuid(body.userId)) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const result = await undoCupWithdrawalCore(getAdminClient(), {
      tournamentId: id,
      userId: body.userId,
    });
    if ('error' in result) return cupActionFailure(result.error, 'withdraw_failed');

    revalidateCup(id, gate.groupId, result.undoneGameIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/[id]/withdraw/undo] threw', err);
    return NextResponse.json({ error: 'withdraw_failed' }, { status: 500 });
  }
}
