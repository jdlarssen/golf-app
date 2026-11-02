import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { finishCupMatchCore } from '@/lib/cup/finishCupMatchCore';
import { revalidateCup } from '@/lib/cup/withdrawalCore';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Arrangøren avslutter én kamp (#2752). De avledede kampene følger med, og et nytt
// forsøk etter et tidsavbrudd er suksess. Peer-godkjenningen slakkes aldri.
//
// WIRE:
//   POST { allowMissing?: boolean } 200 { ok: true, alreadyFinished: boolean }
//     401 unauthorized · 403 not_manager · 404 not_found
//     409 not_active | no_players | not_all_submitted | not_all_approved
//     500 finish_failed

type RouteContext = { params: Promise<{ id: string; gameId: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, gameId } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;
    if (!isUuid(gameId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const body = await jsonObject(request);
    const result = await finishCupMatchCore(getAdminClient(), {
      tournamentId: id,
      gameId,
      actor: { id: gate.userId, name: gate.name?.trim() || 'Arrangør' },
      allowMissing: body.allowMissing === true,
    });
    if (!result.ok) return cupActionFailure(result.error, 'finish_failed');

    revalidateCup(id, gate.groupId, result.gameIds);
    return NextResponse.json({ ok: true, alreadyFinished: result.alreadyFinished });
  } catch (err) {
    console.error('[api/cup/[id]/matches/[gameId]/finish] threw', err);
    return NextResponse.json({ error: 'finish_failed' }, { status: 500 });
  }
}
