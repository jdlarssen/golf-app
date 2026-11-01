import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import type { AppLeagueJoinView } from '@/lib/league/appLeagueView';
import { getLeagueJoinContext } from '@/lib/league/getLeagueJoinContext';
import { joinLeagueByCodeCore } from '@/lib/league/joinLeagueByCode';
import { evaluateLeagueJoin, lateJoinNotice } from '@/lib/league/joinValidation';
import type { LeagueFormat } from '@/lib/league/types';

// «Bli med» i appen (#2748): ligalenka åpner appen, og skjermen spør her. Samme
// oppslag, samme regel og samme skriving som nettsidens `/liga/bli-med/[code]`
// (#2662), fra `getLeagueJoinContext`, `evaluateLeagueJoin` og
// `joinLeagueByCodeCore`.
//
// AUTH: `authenticatedUserId`. Kalleren kommer KUN fra tokenet, og koden KUN fra
// stien. Kroppen leses ikke, så en `user_id` der gjør ingenting. Lenka er porten,
// som på nettsiden: ingen godkjenning, og arrangøren slår den av hvis den sprer
// seg for langt. Svaret har antall deltakere, aldri navn.
//
// WIRE (appen speiler den i `native/app/src/data/league.ts`, typen står i
// `lib/league/appLeagueView.ts`):
//   GET  200 AppLeagueJoinView
//        401 { error: 'unauthorized' }   404 { error: 'not_found' }
//        500 { error: 'load_failed' }
//   POST 200 { leagueId: string }        (også når du alt er med)
//        401 { error: 'unauthorized' }   404 { error: 'not_found' }
//        409 { error: 'closed' | 'profile_incomplete' }
//        500 { error: 'read_failed' | 'save_failed' }

type RouteContext = { params: Promise<{ code: string }> };

const NOT_FOUND = { error: 'not_found' } as const;

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { code } = await ctx.params;
    const context = await getLeagueJoinContext(code, userId);
    const decision = evaluateLeagueJoin(context.facts);
    const league = context.league;
    // `sign_in` kan ikke skje med en bruker fra tokenet; den regnes som at
    // lenka ikke fører noe sted, heller enn at appen får et svar den ikke kjenner.
    if (!league || decision === 'not_found' || decision === 'sign_in') {
      return NextResponse.json(NOT_FOUND, { status: 404 });
    }

    const view: AppLeagueJoinView = {
      decision,
      league: {
        id: league.id,
        name: league.name,
        // DB CHECK (0087) allows the three formats only.
        format: league.format as LeagueFormat,
        isSimulator: league.is_simulator,
        courseName: league.courses?.name ?? null,
      },
      rounds: context.rounds,
      participantCount: context.participantCount,
      lateJoin: lateJoinNotice(context.rounds, Date.now()),
    };
    return NextResponse.json(view);
  } catch (err) {
    console.error('[api/liga/bli-med/[code]] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { code } = await ctx.params;
    const result = await joinLeagueByCodeCore(code, userId);
    if (result.ok) return NextResponse.json({ leagueId: result.leagueId });

    switch (result.error) {
      case 'not_found':
      case 'sign_in':
        return NextResponse.json(NOT_FOUND, { status: 404 });
      case 'closed':
      case 'profile_incomplete':
        return NextResponse.json({ error: result.error }, { status: 409 });
      case 'read_failed':
      case 'save_failed':
        return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (err) {
    console.error('[api/liga/bli-med/[code]] join failed', err);
    return NextResponse.json({ error: 'save_failed' }, { status: 500 });
  }
}
