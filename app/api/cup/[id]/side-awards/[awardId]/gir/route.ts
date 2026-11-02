import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { registerGirCountsCore, revalidateCupSideAwards } from '@/lib/cup/sideAwardCore';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren registrerer GIR-tellerne på ett sidepoeng (#2752), samme kjerne som
// nettet. Virker også etter at cupen er avsluttet, og da regnes vinneren på nytt.
//
// WIRE:
//   POST { team1Count: number, team2Count: number } 200 { ok: true }
//     400 invalid_request · 401 unauthorized · 403 not_manager · 404 not_found
//     409 invalid_counts · 500 save_failed

type RouteContext = { params: Promise<{ id: string; awardId: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, awardId } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;
    if (!isUuid(awardId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const { team1Count, team2Count } = await jsonObject(request);
    if (typeof team1Count !== 'number' || typeof team2Count !== 'number') {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const result = await registerGirCountsCore(getAdminClient(), {
      tournamentId: id,
      awardId,
      team1Count,
      team2Count,
    });
    if (!result.ok) return cupActionFailure(result.error, 'save_failed');

    revalidateCupSideAwards(id, gate.groupId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/[id]/side-awards/[awardId]/gir] threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
