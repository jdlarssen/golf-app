import { NextResponse, type NextRequest } from 'next/server';
import { cupActionFailure, jsonObject, requireCupManager } from '@/lib/cup/cupRouteGate';
import { parseCupPlanForm } from '@/lib/cup/planValidation';
import { revalidateCupSetup, saveCupPlanCore } from '@/lib/cup/setupCore';
import { isTeeOffInPast } from '@/lib/games/gamePayload';
import { getAdminClient } from '@/lib/supabase/admin';

// Oppsettet av en cup fra appen (#2752), samme regler og kjerne som nettets
// `saveCupPlan`. Bare mens cupen er utkast. Tiden kommer som UTC fra appen, der
// nettet tar en Oslo-veggklokke fra skjemaet.
//
// WIRE (kroppen er `CupSetupPlanBody` i `lib/cup/appCupSetupView.ts`):
//   PUT 200 { ok: true } · 401 unauthorized · 403 not_manager · 404 not_found
//       409 not_draft | plan_course | plan_tee | plan_preset | plan_strategy
//           | plan_sessions | plan_best_ball | plan_tee_off_invalid | plan_tee_off_past
//       502 plan_matches_not_updated (planen ER lagret, prøv igjen)
//       500 plan_save_failed

type RouteContext = { params: Promise<{ id: string }> };

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const gate = await requireCupManager(request, id);
    if (!gate.ok) return gate.response;

    const body = await jsonObject(request);
    const parsed = parseCupPlanForm({
      presetId: text(body.presetId),
      strategy: text(body.strategy),
      customSessionsRaw: JSON.stringify(body.customSessions ?? ''),
      bestBallAllowanceRaw: body.bestBallAllowancePct == null ? '' : String(body.bestBallAllowancePct),
    });
    if (!parsed.ok) return cupActionFailure(parsed.error, 'plan_save_failed');

    const courseId = text(body.courseId);
    const teeBoxId = text(body.teeBoxId);
    if (!courseId) return cupActionFailure('plan_course', 'plan_save_failed');
    if (!teeBoxId) return cupActionFailure('plan_tee', 'plan_save_failed');

    let scheduledTeeOffAt: string | null = null;
    if (body.teeOffAt != null) {
      const at = new Date(typeof body.teeOffAt === 'string' ? body.teeOffAt : Number.NaN);
      if (Number.isNaN(at.getTime())) return cupActionFailure('plan_tee_off_invalid', 'plan_save_failed');
      scheduledTeeOffAt = at.toISOString();
      if (isTeeOffInPast(scheduledTeeOffAt)) return cupActionFailure('plan_tee_off_past', 'plan_save_failed');
    }

    const result = await saveCupPlanCore(getAdminClient(), {
      tournamentId: id,
      courseId,
      teeBoxId,
      scheduledTeeOffAt,
      values: parsed.values,
    });
    if (result.ok || result.error === 'plan_matches_not_updated') revalidateCupSetup(id, gate.groupId);
    if (!result.ok) return cupActionFailure(result.error, 'plan_save_failed');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/cup/[id]/plan] threw', err);
    return NextResponse.json({ error: 'plan_save_failed' }, { status: 500 });
  }
}
