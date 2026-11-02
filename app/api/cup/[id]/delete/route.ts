import { NextResponse, type NextRequest } from 'next/server';
import type { AppCupDeletePreview } from '@/lib/cup/appCupDeleteView';
import { requireCupManager } from '@/lib/cup/cupRouteGate';
import { deleteCupCore, revalidateCupDeleted } from '@/lib/cup/deleteCupCore';
import { planTournamentGameDeletion } from '@/lib/cup/tournamentGameDeletion';
import { getAdminClient } from '@/lib/supabase/admin';

// Sletter et utkast fra appen (#2752), med samme kjerne som nettets `deleteTournament`. Appen
// sletter bare det som ikke er startet. Nettet viser hva en startet cup tar med seg, og den
// vurderingen hører hjemme der.
//
// WIRE:
//   GET    200 AppCupDeletePreview · 401 unauthorized · 403 not_manager · 404 not_found · 500 load_failed
//   DELETE 200 { ok: true, name } · 401 unauthorized · 403 not_manager · 404 not_found
//          409 not_draft · 500 delete_failed

type RouteContext = { params: Promise<{ id: string }> };

async function readCup(id: string) {
  const { data, error } = await getAdminClient()
    .from('tournaments')
    .select('name, status, team_1_name, team_2_name')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const cup = await readCup(id);
    if (!cup) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const plan = await planTournamentGameDeletion(id);
    const body: AppCupDeletePreview = {
      name: cup.name,
      team1Name: cup.team_1_name,
      team2Name: cup.team_2_name,
      draft: cup.status === 'draft',
      matchCount: plan.hostIdsToDelete.length + plan.derivedIdsRidingAlong.length,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/cup/delete] GET threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const cup = await readCup(id);
    if (!cup) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (cup.status !== 'draft') return NextResponse.json({ error: 'not_draft' }, { status: 409 });

    const deleted = await deleteCupCore(gate.caller, id);
    if (!deleted.ok) {
      return NextResponse.json({ error: deleted.error }, { status: deleted.error === 'not_found' ? 404 : 500 });
    }

    revalidateCupDeleted(id, gate.groupId);
    return NextResponse.json({ ok: true, name: deleted.name });
  } catch (err) {
    console.error('[api/cup/delete] DELETE threw', err);
    return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
  }
}
