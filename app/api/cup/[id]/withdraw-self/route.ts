import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { revalidateCup, withdrawSelfFromCupCore } from '@/lib/cup/withdrawalCore';
import { cupActionFailure } from '@/lib/cup/cupRouteGate';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Spilleren trekker seg selv fra cupen (#2752), samme kjerne som nettet. Raden
// slettes ikke (#1937): en slettet rad ville etterlatt en ufullstendig side som
// auto-start aldri kunne starte. Ingen selv-angre, det er arrangørens.
//
// WIRE:
//   POST 200 { ok: true, partial: boolean } · 401 unauthorized
//     403 not_participant (står ikke i noen av cupens kamper) · 404 not_found
//     409 regelens kode · 500 withdraw_failed

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const result = await withdrawSelfFromCupCore(getAdminClient(), {
      tournamentId: id,
      userId,
    });
    if ('error' in result) {
      if (result.error === 'not_participant') {
        return NextResponse.json({ error: 'not_participant' }, { status: 403 });
      }
      return cupActionFailure(result.error, 'withdraw_failed');
    }

    revalidateCup(id, result.groupId, [...result.writtenGameIds, ...result.skippedGameIds]);
    return NextResponse.json({ ok: true, partial: result.skippedGameIds.length > 0 });
  } catch (err) {
    console.error('[api/cup/[id]/withdraw-self] threw', err);
    return NextResponse.json({ error: 'withdraw_failed' }, { status: 500 });
  }
}
