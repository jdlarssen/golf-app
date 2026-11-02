import { NextResponse, type NextRequest } from 'next/server';
import type { AppCupGenerateView } from '@/lib/cup/appCupGenerateView';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';
import { requireCupManager } from '@/lib/cup/cupRouteGate';
import { MAX_PERSONAL_CUP_MATCHES } from '@/lib/cup/limits';
import { loadCupGenerateInput } from '@/lib/cup/loadCupGenerateInput';
import { getAdminClient } from '@/lib/supabase/admin';

// Det «Fordel & generer» i appen bygger på (#2752): planen, de påmeldte og taket, lest
// av samme funksjon som nettets side. Bare for den som styrer cupen: svaret har
// spillernes handicap og kjønn, som regnehjelpen for greensomen trenger.
//
// WIRE (typen er `AppCupGenerateView` i `lib/cup/appCupGenerateView.ts`):
//   GET 200 view · 401 unauthorized · 403 not_manager · 404 not_found · 500 load_failed

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const admin = getAdminClient();
    const [cupRes, gamesRes, input] = await Promise.all([
      admin.from('tournaments').select('name, status, team_1_name, team_2_name').eq('id', id).maybeSingle(),
      // Admin-klienten: games-RLS lar bare den som laget kampen se den (#2214).
      admin.from('games').select('id', { head: true, count: 'exact' }).eq('tournament_id', id),
      loadCupGenerateInput(gate.caller, admin, id, APP_CUP_UNKNOWN_PLAYER),
    ]);
    if (cupRes.error) throw cupRes.error;
    if (gamesRes.error) throw gamesRes.error;
    if (!cupRes.data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const cup = cupRes.data;

    const body: AppCupGenerateView = {
      id,
      name: cup.name,
      status: cup.status as AppCupGenerateView['status'],
      team1Name: cup.team_1_name,
      team2Name: cup.team_2_name,
      matchCap: !gate.groupId && !gate.isAdmin ? MAX_PERSONAL_CUP_MATCHES : null,
      existingMatchCount: gamesRes.count ?? 0,
      plan: input.selectedTee
        ? {
            courseName: input.planCourseName,
            teeName: input.planTeeName,
            tee: input.selectedTee,
            presetId: input.presetId,
            customSessions: input.customSessions,
            strategy: input.strategy,
          }
        : null,
      players: input.participants,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/cup/generate] threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
