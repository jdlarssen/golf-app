import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { isSignupShortId } from '@/lib/appLinks/appLinkPaths';
import type { AppCupJoinView } from '@/lib/cup/appCupSetupView';
import { cupActionFailure } from '@/lib/cup/cupRouteGate';
import { joinCupCore, leaveCupCore } from '@/lib/cup/cupJoinCore';
import { getCupJoinContext } from '@/lib/cup/getCupJoinContext';
import { evaluateCupJoin } from '@/lib/cup/joinValidation';
import { MAX_PERSONAL_CUP_PLAYERS } from '@/lib/cup/limits';
import { formatTeeOffLongParts } from '@/lib/i18n/format';
import { getAdminClient } from '@/lib/supabase/admin';

// Cup-lenka i appen (#2752): `/cup/bli-med/<kode>` åpner en skjerm som spør her. Samme
// regel og samme skriving som nettsiden, fra `evaluateCupJoin` og `cupJoinCore`. Lenka
// ER gaten, som på nettet (eierbeslutning 2026-08-07: ingen godkjenningsrunde).
//
// AUTH: `authenticatedUserId`. Kalleren kommer KUN fra tokenet og cupen KUN fra stien,
// så du kan bare melde på og av deg selv. Svaret har aldri navn på andre spillere.
//
// WIRE (`lib/cup/appCupSetupView.ts`):
//   GET    200 AppCupJoinView · 401 unauthorized · 404 not_found · 500 load_failed
//   POST   200 { status: 'joined' | 'joined_self' | 'already_joined' }
//   DELETE 200 { status: 'left' | 'left_self' | 'not_joined' }
//          begge: 401 · 404 not_found · 409 closed | full | not_member | profile_incomplete
//          500 read_failed | save_failed

type RouteContext = { params: Promise<{ shortId: string }> };

const UNAUTHORIZED = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 });
const NOT_FOUND = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return UNAUTHORIZED();
    const { shortId } = await ctx.params;
    if (!isSignupShortId(shortId)) return NOT_FOUND();

    const { cup, facts } = await getCupJoinContext(shortId, userId);
    if (!cup) return NOT_FOUND();
    const decision = evaluateCupJoin(facts);

    const admin = getAdminClient();
    let club: AppCupJoinView['club'] = null;
    if (decision === 'not_member' && cup.group_id) {
      const { data, error } = await admin.from('groups').select('name, short_id').eq('id', cup.group_id).maybeSingle();
      if (error) throw error;
      if (data) club = { name: data.name, shortId: data.short_id };
    }

    let courseName: string | null = null;
    let when: AppCupJoinView['when'] = null;
    if (decision === 'can_join' || decision === 'already_joined') {
      const { data, error } = await admin
        .from('tournament_plans')
        .select('scheduled_tee_off_at, courses:courses!tournament_plans_course_id_fkey(name)')
        .eq('tournament_id', cup.id)
        .maybeSingle();
      if (error) throw error;
      courseName = data?.courses?.name ?? null;
      when = data?.scheduled_tee_off_at ? formatTeeOffLongParts(data.scheduled_tee_off_at, 'no') : null;
    }

    const body: AppCupJoinView = {
      decision,
      cup: { id: cup.id, name: cup.name, team1Name: cup.team_1_name, team2Name: cup.team_2_name },
      courseName,
      when,
      cap: MAX_PERSONAL_CUP_PLAYERS,
      club,
      // `canViewCupPage` gir en klubb-cup bare til medlemmer og deltakere.
      canOpenCup: !cup.group_id || facts.isClubMember || facts.alreadyJoined,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/cup/join] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return UNAUTHORIZED();
    const { shortId } = await ctx.params;
    if (!isSignupShortId(shortId)) return NOT_FOUND();

    const result = await joinCupCore(shortId, userId);
    if (!result.ok) return failure(result.error);
    return NextResponse.json({ status: result.status });
  } catch (err) {
    console.error('[api/cup/join] join threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return UNAUTHORIZED();
    const { shortId } = await ctx.params;
    if (!isSignupShortId(shortId)) return NOT_FOUND();

    const result = await leaveCupCore(shortId, userId);
    if (!result.ok) return failure(result.error);
    return NextResponse.json({ status: result.status });
  } catch (err) {
    console.error('[api/cup/join] leave threw', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}

/** En feil i lesingen er 500 med sin egen kode, så skjermen kan be deg prøve igjen. */
function failure(error: string): NextResponse {
  if (error === 'read_failed') return NextResponse.json({ error }, { status: 500 });
  return cupActionFailure(error, 'save_failed');
}
