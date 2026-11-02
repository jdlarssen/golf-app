import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, requireCupManager } from '@/lib/cup/cupRouteGate';
import { revalidateCupStarted, startTournamentCore } from '@/lib/cup/startTournamentCore';

// Starter en cup fra appen (#2752), med samme kjerne som nettets `startTournament`.
//
// WIRE:
//   POST 200 { ok: true } · 401 unauthorized · 403 not_manager · 404 not_found
//        409 too_few_matches | wrong_status
//        500 start_failed

// Varslene og e-posten går før svaret, som på nettet. En klubb-cup kan ha mange mottakere.
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const started = await startTournamentCore(gate.caller, id);
    if (!started.ok) return cupActionFailure(started.error, 'start_failed');

    revalidateCupStarted(id, gate.groupId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/start] threw', err);
    return NextResponse.json({ error: 'start_failed' }, { status: 500 });
  }
}
