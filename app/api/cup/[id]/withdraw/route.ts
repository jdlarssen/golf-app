import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, jsonObject, requireCupManager, uuidList } from '@/lib/cup/cupRouteGate';
import { revalidateCup, withdrawCupPlayerCore } from '@/lib/cup/withdrawalCore';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren trekker en spiller fra cupen (#2752), samme kjerne som nettet.
// Bare kamper som ikke har startet flagges, og poengene utledes av regelen.
//
// WIRE:
//   POST { userId, playOnGameIds?, offeredGameIds? }
//     200 { ok: true, partial: boolean } · 400 invalid_request · 401 unauthorized
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

    const result = await withdrawCupPlayerCore(getAdminClient(), {
      tournamentId: id,
      userId: body.userId,
      byUserId: gate.userId,
      playOnGameIds: new Set(uuidList(body.playOnGameIds)),
      offeredGameIds: new Set(uuidList(body.offeredGameIds)),
    });
    if ('error' in result) return cupActionFailure(result.error, 'withdraw_failed');

    revalidateCup(id, gate.groupId, [...result.writtenGameIds, ...result.skippedGameIds]);
    return NextResponse.json({ ok: true, partial: result.skippedGameIds.length > 0 });
  } catch (err) {
    console.error('[api/cup/[id]/withdraw] threw', err);
    return NextResponse.json({ error: 'withdraw_failed' }, { status: 500 });
  }
}
