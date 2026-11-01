import { NextResponse, type NextRequest } from 'next/server';
import type { AppCupSwapCandidates } from '@/lib/cup/appCupManageView';
import { buildAppCupSwapCandidates } from '@/lib/cup/buildAppCupManageView';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';
import { requireCupManager } from '@/lib/cup/cupRouteGate';
import { getCupCandidatePlayers } from '@/lib/cup/getCupCandidatePlayers';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';

// Hvem som kan byttes i en kamp (#2752), det nettets `swapOptionsFor` lister.
// Lista er hjelp. Vakta er `validateMatchSwap` i byttet selv.
//
// WIRE (`lib/cup/appCupManageView.ts`):
//   GET 200 AppCupSwapCandidates · 401 unauthorized · 403 not_manager
//       404 not_found (også en kamp i en annen cup) · 500 load_failed

type RouteContext = { params: Promise<{ id: string; gameId: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, gameId } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const snapshot = await getCupSnapshot(id, APP_CUP_UNKNOWN_PLAYER);
    if (!snapshot) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const candidates = await getCupCandidatePlayers(gate.caller, {
      groupId: gate.groupId,
      userId: gate.userId,
      isAdmin: gate.isAdmin,
      unknownLabel: APP_CUP_UNKNOWN_PLAYER,
    });
    const body: AppCupSwapCandidates | null = buildAppCupSwapCandidates(snapshot, {
      gameId,
      candidates,
      unknownLabel: APP_CUP_UNKNOWN_PLAYER,
    });
    if (!body) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/cup/[id]/matches/[gameId]/swap-candidates] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
