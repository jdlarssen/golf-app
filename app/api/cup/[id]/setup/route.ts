import { NextResponse, type NextRequest } from 'next/server';
import { buildAppCupSetupView } from '@/lib/cup/buildAppCupSetupView';
import { requireCupManager } from '@/lib/cup/cupRouteGate';
import { getAdminClient } from '@/lib/supabase/admin';

// Det veiviseren i appen trenger for å fortsette et utkast (#2752): planen og
// sidepoengene slik de står. Leses med service role bak arrangørens port, for planen
// og sidepoengene har ingen lese-policy for klienter.
//
// WIRE (`lib/cup/appCupSetupView.ts`):
//   GET 200 AppCupSetupView · 401 unauthorized · 403 not_manager · 404 not_found
//       500 load_failed

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const admin = getAdminClient();
    const [cupRes, planRes, awardsRes] = await Promise.all([
      admin.from('tournaments').select('id, name, status, team_1_name, team_2_name').eq('id', id).maybeSingle(),
      admin
        .from('tournament_plans')
        .select('course_id, tee_box_id, scheduled_tee_off_at, preset_id, custom_sessions, strategy, best_ball_allowance_pct')
        .eq('tournament_id', id)
        .maybeSingle(),
      admin
        .from('tournament_side_awards')
        .select('kind, hole_number, points, gir_max_per_team')
        .eq('tournament_id', id)
        .order('kind')
        .order('hole_number')
        .order('slot'),
    ]);
    if (cupRes.error) throw cupRes.error;
    if (planRes.error) throw planRes.error;
    if (awardsRes.error) throw awardsRes.error;
    if (!cupRes.data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    return NextResponse.json(
      buildAppCupSetupView(
        cupRes.data,
        planRes.data,
        (awardsRes.data ?? []).map((row) => ({
          kind: row.kind as 'ctp' | 'ld' | 'gir',
          holeNumber: row.hole_number,
          points: Number(row.points),
          maxPerTeam: row.gir_max_per_team,
        })),
      ),
    );
  } catch (err) {
    console.error('[api/cup/[id]/setup] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
