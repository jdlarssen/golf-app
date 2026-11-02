import { NextResponse, type NextRequest } from 'next/server';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { finishTournamentCore } from '@/lib/cup/finishTournamentCore';
import { revalidateCup } from '@/lib/cup/withdrawalCore';
import { getAdminClient } from '@/lib/supabase/admin';

// Arrangøren avslutter cupen (#2752), samme kjerne som nettet: sidepoengene må være
// registrert, kamper uten levering stopper til `allowMissing` er satt, og varselet
// går én gang. Et nytt forsøk på en avsluttet cup er suksess.
//
// WIRE:
//   POST { allowMissing?: boolean } 200 { ok: true, alreadyFinished: boolean }
//     401 unauthorized · 403 not_manager · 404 not_found
//     409 side_awards_missing | matches_not_submitted · 502 match_finish_failed
//     500 finish_failed

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const body = await jsonObject(request);
    const result = await finishTournamentCore(getAdminClient(), gate.caller, {
      tournamentId: id,
      actor: { id: gate.userId, name: gate.name?.trim() || 'Arrangør' },
      allowMissing: body.allowMissing === true,
      unknownLabel: APP_CUP_UNKNOWN_PLAYER,
    });
    if (!result.ok) return cupActionFailure(result.error, 'finish_failed');

    revalidateCup(id, gate.groupId, []);
    return NextResponse.json({ ok: true, alreadyFinished: result.alreadyFinished });
  } catch (err) {
    console.error('[api/cup/[id]/finish] threw', err);
    return NextResponse.json({ error: 'finish_failed' }, { status: 500 });
  }
}
