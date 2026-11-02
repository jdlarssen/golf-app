import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, requireCupManager } from '@/lib/cup/cupRouteGate';
import { removeCupParticipantCore, revalidateCupSetup } from '@/lib/cup/setupCore';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Fjern en spiller fra lista (#2752), samme kjerne som nettets. Rører aldri kamper
// som alt er laget, og en spiller som alt er borte, er suksess.
//
// WIRE:
//   DELETE 200 { ok: true } · 401 · 403 not_manager · 404 not_found
//          409 not_draft · 500 plan_save_failed

type RouteContext = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, userId } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;
    if (!isUuid(userId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const result = await removeCupParticipantCore(getAdminClient(), { tournamentId: id, targetUserId: userId });
    if (!result.ok) return cupActionFailure(result.error, 'plan_save_failed');

    revalidateCupSetup(id, gate.groupId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/[id]/participants/[userId]] threw', err);
    return NextResponse.json({ error: 'plan_save_failed' }, { status: 500 });
  }
}
