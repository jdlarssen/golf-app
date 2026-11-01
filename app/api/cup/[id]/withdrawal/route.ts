import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import type { AppCupWithdrawalView } from '@/lib/cup/appCupManageView';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';
import { buildAppCupWithdrawalView } from '@/lib/cup/buildAppCupWithdrawalView';
import { canViewCupPageAs } from '@/lib/cup/cupPageAccess';
import { requireCupManager } from '@/lib/cup/cupRouteGate';
import { loadCupWithdrawalContext } from '@/lib/cup/cupWithdrawalContext';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { isUuid } from '@/lib/url/isUuid';

// Bekreftelsesskjermene for trekk i appen (#2752), det nettets `/cup/[id]/trekk`
// og `/admin/cup/[id]/trekk/[userId]` viser. Konsekvensene regnes av samme
// regelmodul som skrivingen.
//
// Uten `userId`: spillerens eget trekk, med samme port som cup-siden
// (`canViewCupPageAs`). Med `userId`: arrangørens, bare for den som styrer cupen.
//
// WIRE (`lib/cup/appCupManageView.ts`):
//   GET ?userId= 200 AppCupWithdrawalView · 401 unauthorized · 403 not_manager
//       404 not_found (også den som ikke står i noen av cupens kamper) · 500 load_failed

type RouteContext = { params: Promise<{ id: string }> };

const NOT_FOUND = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const target = request.nextUrl.searchParams.get('userId');
    if (target !== null && !isUuid(target)) return NOT_FOUND();

    let userId: string;
    if (target !== null) {
      const gate = await requireCupManager(request, id);
      if (!gate.ok) return gate.response;
      userId = target;
    } else {
      const self = await authenticatedUserId(request);
      if (!self) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      if (!isUuid(id)) return NOT_FOUND();
      const snapshot = await getCupSnapshot(id, APP_CUP_UNKNOWN_PLAYER);
      if (!snapshot) return NOT_FOUND();
      const caller = callerScopedClient(request);
      if (!caller) throw new Error('caller-scoped client unavailable');
      const allowed = await canViewCupPageAs(caller, {
        tournamentId: id,
        groupId: snapshot.tournament.group_id,
        roster: snapshot.roster,
        userId: self,
      });
      if (!allowed) return NOT_FOUND();
      userId = self;
    }

    const context = await loadCupWithdrawalContext({
      tournamentId: id,
      userId,
      unknownLabel: APP_CUP_UNKNOWN_PLAYER,
    });
    // Står ikke i én eneste av cupens kamper: ingenting å bekrefte.
    if (!context || (context.pending.length === 0 && context.untouched.length === 0)) {
      return NOT_FOUND();
    }

    const body: AppCupWithdrawalView = buildAppCupWithdrawalView(context, {
      isSelf: target === null,
    });
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/cup/[id]/withdrawal] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
