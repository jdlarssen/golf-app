import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import type { AppCupView } from '@/lib/cup/appCupView';
import { APP_CUP_UNKNOWN_PLAYER, buildAppCupView } from '@/lib/cup/buildAppCupView';
import { canViewCupPageAs } from '@/lib/cup/cupPageAccess';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Cup-rommet i appen (#2752): det nettets `/cup/[id]` og `/cup/[id]/resultater`
// viser. Poengene og vinneren regnes på serveren (`getCupSnapshot`), og appen
// regner dem aldri selv.
//
// **Ingen poeng før cupen er avsluttet** (#1468, eierens svar igjen 01.11).
// `buildAppCupView` er det eneste som slipper data ut, så svaret sier ikke mer
// enn skjermen viser, heller ikke til den som leser JSON-en.
//
// AUTH: `authenticatedUserId`. Tilgangen er den samme som på nettsiden, med
// samme regel (`canViewCupPageAs`): en personlig cup er åpen for alle innloggede,
// en klubb-cup for deltakerne, klubben og global admin. Medlemskapet leses som
// kalleren. Får kalleren ikke se cupen, svarer ruta 404 som for en cup som ikke
// finnes, så den ikke røper at den finnes. En lesefeil er 500, aldri 404.
//
// WIRE (appen speiler den, `lib/cup/appCupView.ts`):
//   GET 200 AppCupView · 401 unauthorized · 404 not_found · 500 load_failed

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const snapshot = await getCupSnapshot(id, APP_CUP_UNKNOWN_PLAYER);
    if (!snapshot) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const caller = callerScopedClient(request);
    if (!caller) throw new Error('caller-scoped client unavailable');
    const allowed = await canViewCupPageAs(caller, {
      tournamentId: id,
      groupId: snapshot.tournament.group_id,
      roster: snapshot.roster,
      userId,
    });
    if (!allowed) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // Bare om økter er åpne, aldri hva kapteinene har valgt (`visibleSlots` i
    // `lineupData.ts` vokter uttakene, og de leses ikke her).
    const { data: pending, error: pendingError } = await getAdminClient()
      .from('cup_lineup_sessions')
      .select('id')
      .eq('tournament_id', id)
      .is('revealed_at', null)
      .limit(1);
    if (pendingError) throw pendingError;

    const body: AppCupView = buildAppCupView(snapshot, {
      userId,
      lineupPending: (pending ?? []).length > 0,
      unknownLabel: APP_CUP_UNKNOWN_PLAYER,
    });
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/cup/[id]] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
