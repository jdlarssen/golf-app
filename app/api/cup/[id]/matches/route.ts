import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { generateCupMatchesCore, revalidateCupGenerated } from '@/lib/cup/generateMatchesCore';
import { parseCupBatchMatches } from '@/lib/cup/parseCupBatchMatches';
import { getAdminClient } from '@/lib/supabase/admin';

// Oppretter kampene fra appen (#2752), med samme kjerne og samme regler som nettets
// `createCupMatchesFromPlan`. Kampene skrives med arrangørens egen klient, og en feil
// midt i rydder opp etter seg. Bane, tee og tid leses fra den lagrede planen.
//
// WIRE (kroppen er `CupMatchesBody` i `lib/cup/appCupGenerateView.ts`):
//   POST 200 { ok: true } · 400 invalid_request · 401 unauthorized · 403 not_manager
//        404 not_found
//        409 matches_changed | not_draft | no_matches | missing_plan | plan_tee
//            | tee_off_in_past | not_members | too_many_matches | too_many_players
//            | invalid_team_strokes_override | invalid_source_match
//        500 insert_failed | profile_read_failed | rollback_failed

// #1894: skrivingen går kamp for kamp, og rollbacken overlever ikke et tidsavbrudd.
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const body = await jsonObject(request);
    const matches = parseCupBatchMatches(body.matches);
    const expected = body.expectedExisting;
    if (!matches || typeof expected !== 'number') {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    // En generering legger til kamper. Kom kallet to ganger fordi svaret på det første
    // gikk tapt, ville alle blitt laget på nytt. Admin-klienten: games-RLS lar bare den
    // som laget kampen se den (#2214).
    const { count, error: countError } = await getAdminClient()
      .from('games')
      .select('id', { head: true, count: 'exact' })
      .eq('tournament_id', id);
    if (countError) throw countError;
    if ((count ?? 0) !== expected) return cupActionFailure('matches_changed', 'insert_failed');

    const outcome = await generateCupMatchesCore(gate.caller, {
      tournamentId: id,
      userId: gate.userId,
      isAdmin: gate.isAdmin,
      matches,
    });
    if ('error' in outcome) return cupActionFailure(outcome.error, 'insert_failed');

    revalidateCupGenerated(id, outcome.groupId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/matches] threw', err);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }
}
