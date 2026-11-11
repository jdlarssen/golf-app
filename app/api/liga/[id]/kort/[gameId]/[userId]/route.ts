import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { isUuid } from '@/lib/url/isUuid';
import { leagueCardAccess, loadLeagueCard } from '@/lib/league/leagueCardAccess';
import type { LeagueCardResponse } from '@/lib/league/appLeagueView';

// Kortet bak et resultat i sesongtabellen, i appen (#2815): det nettets
// /liga/[id]/kort/… viser.
//
// En ligakamerat står som regel ikke i flighten, og RLS viser et ferdig spill
// bare til spillerne (#1542). Kortet leses derfor med service role bak
// `leagueCardAccess`: kalleren må få se ligaen (`canViewLeague`, medlemskapet
// lest som kalleren), og kortet må telle i tabellen. Alt annet er 404, som om
// kortet ikke fantes. Kortet regnes ferdig på serveren; appen tegner det bare.
//
// WIRE (appen speiler den, `native/app/src/data/leagueCard.ts`):
//   GET 200 LeagueCardResponse (lib/league/appLeagueView.ts)
//       401 unauthorized · 404 not_found · 500 load_failed

type RouteContext = { params: Promise<{ id: string; gameId: string; userId: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id: leagueId, gameId, userId: playerUserId } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (![leagueId, gameId, playerUserId].every(isUuid)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const caller = callerScopedClient(request);
    if (!caller) throw new Error('caller-scoped client unavailable');
    const access = await leagueCardAccess(caller, { callerId: userId, leagueId, gameId, playerUserId });
    if (!access.ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const loaded = await loadLeagueCard(access);
    if (!loaded) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const body: LeagueCardResponse = loaded.card;
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/liga/[id]/kort] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
