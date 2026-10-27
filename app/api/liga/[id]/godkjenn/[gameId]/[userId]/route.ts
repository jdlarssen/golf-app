import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { isUuid } from '@/lib/url/isUuid';
import { loadMarkerCard, markerCardHoles, markerReviewAccess } from '@/lib/league/markerReviewAccess';
import type { MarkerCardResponse } from '@/lib/league/appLeagueView';

// Markørens kort i appen (#2661): det nettets /liga/[id]/godkjenn/… viser.
//
// Markøren står som regel ikke i flighten, og RLS viser et spill bare til
// spillerne. Kortet leses derfor med service role bak `markerReviewAccess`:
// den navngitte markøren, ligaens arrangør eller en global admin. Alle andre
// får 404, som om kortet ikke fantes. Svaret på kortet (godkjenn, send
// tilbake) går gjennom den vanlige scorekort-ruta
// (`app/api/games/[id]/scorecards/[userId]`), der den samme porten sitter.
//
// WIRE (appen speiler den, `native/app/src/data/marker.ts`):
//   GET 200 MarkerCardResponse (lib/league/appLeagueView.ts)
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

    const review = await markerReviewAccess(userId, gameId, playerUserId);
    if (!review.ok || review.flight.leagueId !== leagueId) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    const card = await loadMarkerCard(review);
    const body: MarkerCardResponse = {
      leagueId,
      leagueName: review.flight.leagueName,
      roundLabel: review.flight.roundLabel,
      gameId,
      player: { userId: review.card.userId, name: review.card.name },
      role: review.role,
      markerName: review.card.markerName,
      state: review.state,
      holes: markerCardHoles(card, review.card.teeGender),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/liga/[id]/godkjenn] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
