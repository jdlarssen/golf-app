import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';
import { buildAppCupLineupView } from '@/lib/cup/buildAppCupLineupView';
import { lineupAccessFor } from '@/lib/cup/lineupRoute';
import { loadCupLineupBoardFor } from '@/lib/cup/lineupData';
import { isUuid } from '@/lib/url/isUuid';

// Uttaks-tavla for appen (#2752). Tabellene har ingen policy (0172), så det er tilgangen og
// `canSeeTeamLineup` i `loadCupLineupBoardFor` som holder uttakene hemmelige. Motstanderens
// plasser er `slots: null` til begge har levert.
//
// WIRE (typen er `AppCupLineupView` i `lib/cup/appCupLineupView.ts`):
//   GET 200 view · 401 unauthorized · 403 not_allowed · 404 not_found · 500 load_failed
//   En cup du ikke har noe med, og en cup uten kapteiner, svarer det samme: 403.

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const access = await lineupAccessFor(userId)(id);
    if (access.role.kind === 'none') return NextResponse.json({ error: 'not_allowed' }, { status: 403 });

    const board = await loadCupLineupBoardFor(access, id, APP_CUP_UNKNOWN_PLAYER);
    if (!board) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(buildAppCupLineupView(board));
  } catch (err) {
    console.error('[api/cup/lineup] threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
