import type { NextRequest } from 'next/server';
import { runLeagueSelfService } from '@/lib/league/appSelfService';

// «Bli med i ligaen» fra appen (#2839): et klubbmedlem melder seg på en klubbliga
// som ikke har startet. Skrivingen er `join_club_league` (0086), den samme som
// nettets «Bli med i ligaen», og funksjonen er porten. Se `runLeagueSelfService`
// for auth: kallerens egen klient, aldri service role, aldri en id fra kroppen.
//
// WIRE (appen speiler den i `native/app/src/data/league.ts`):
//   POST 200 { leagueId }        (også når du alt er med)
//        401 { error: 'unauthorized' }   404 { error: 'not_found' }
//        409 { error: 'not_draft' | 'not_member' | 'not_club_league' }
//        500 { error: 'save_failed' }

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  return runLeagueSelfService(request, id, 'join_club_league', {
    ok: ['joined', 'already_member'],
    refused: ['not_draft', 'not_member', 'not_club_league'],
  });
}
