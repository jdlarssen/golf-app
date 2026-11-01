import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { expireCupSwapCaches, swapCupMatchPlayerCore } from '@/lib/cup/swapCupMatchPlayerCore';
import { revalidateCup } from '@/lib/cup/withdrawalCore';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren bytter en spiller i en kamp (#2752), samme kjerne som nettet. På en
// delt dag byttes hele bunten, og en feil midt i byttet ruller alt tilbake.
//
// WIRE:
//   POST { outUserId, inUserId } 200 { ok: true } · 400 invalid_request
//     401 unauthorized · 403 not_manager · 404 not_found · 409 regelens kode
//     500 swap_failed

type RouteContext = { params: Promise<{ id: string; gameId: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, gameId } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;
    if (!isUuid(gameId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const body = await jsonObject(request);
    const { outUserId, inUserId } = body;
    if (
      typeof outUserId !== 'string' ||
      typeof inUserId !== 'string' ||
      !isUuid(outUserId) ||
      !isUuid(inUserId)
    ) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const result = await swapCupMatchPlayerCore(getAdminClient(), gate.caller, {
      tournamentId: id,
      gameId,
      groupId: gate.groupId,
      actorUserId: gate.userId,
      actorIsAdmin: gate.isAdmin,
      outUserId,
      inUserId,
    });
    if ('error' in result) return cupActionFailure(result.error, 'swap_failed');

    expireCupSwapCaches(id, result.gameIds);
    revalidateCup(id, gate.groupId, result.gameIds);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/[id]/matches/[gameId]/swap] threw', err);
    return NextResponse.json({ error: 'swap_failed' }, { status: 500 });
  }
}
