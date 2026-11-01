import { NextResponse, type NextRequest } from 'next/server';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';
import type { AppCupManageView } from '@/lib/cup/appCupManageView';
import { buildAppCupManageView } from '@/lib/cup/buildAppCupManageView';
import { requireCupManager } from '@/lib/cup/cupRouteGate';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';

// «Styr cupen» i appen (#2752): spillerne, kampene som ikke har startet, og
// makkervalget. Bare for den som styrer cupen (`requireCupManager`).
//
// WIRE (appen speiler den, `lib/cup/appCupManageView.ts`):
//   GET 200 AppCupManageView · 401 unauthorized · 403 not_manager · 404 not_found
//       500 load_failed

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const snapshot = await getCupSnapshot(id, APP_CUP_UNKNOWN_PLAYER);
    if (!snapshot) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const body: AppCupManageView = buildAppCupManageView(snapshot, {
      unknownLabel: APP_CUP_UNKNOWN_PLAYER,
    });
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/cup/[id]/manage] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
