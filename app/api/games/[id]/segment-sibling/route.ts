import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { findSegmentSibling } from '@/lib/games/segmentSibling';
import type { SegmentSiblingResponse } from '@/lib/games/segmentSiblingRules';
import type { HoleSegment } from '@/lib/scoring';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';

// Den andre halvdelen av en delt cup-dag, for appen (#2752).
//
// Nettets hullside spør `findSegmentSibling` selv (`holeSegmentBridges.ts`).
// Den leser med admin-klienten, så en telefon kan ikke gjøre det samme: appen
// spør her, legger svaret i spill-bundelen og har broen også uten nett.
//
// AUTH: Bearer-tokenet (`authenticatedUserId`). `findSegmentSibling` forutsetter
// at kalleren er spiller i spillet (se kommentaren der), og det sjekkes her. En
// ukjent spill-id og et spill kalleren ikke er med i svarer begge 404, så ruta
// ikke røper hvilke spill som finnes.
//
// WIRE (appen speiler den, `native/app/src/data/segmentSibling.ts`):
//   GET 200 SegmentSiblingResponse (lib/games/segmentSiblingRules.ts):
//           { sibling: null } for alt som ikke er en halvdel med et søsken
//       401 unauthorized · 404 not_found · 500 load_failed

const LOG_PREFIX = 'api/games/[id]/segment-sibling';

type RouteContext = { params: Promise<{ id: string }> };

type GameRow = {
  hole_segment: HoleSegment;
  source_game_id: string | null;
  tournament_id: string | null;
};

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id: gameId } = await ctx.params;

    const userId = await authenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (!isUuid(gameId)) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const admin = getAdminClient();
    const [gameRes, membershipRes] = await Promise.all([
      admin
        .from('games')
        .select('hole_segment, source_game_id, tournament_id')
        .eq('id', gameId)
        .maybeSingle<GameRow>(),
      admin
        .from('game_players')
        .select('user_id')
        .eq('game_id', gameId)
        .eq('user_id', userId)
        .maybeSingle<{ user_id: string }>(),
    ]);
    if (gameRes.error) throw gameRes.error;
    if (membershipRes.error) throw membershipRes.error;
    if (!gameRes.data || !membershipRes.data) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const body: SegmentSiblingResponse = {
      sibling: await findSegmentSibling(userId, {
        gameId,
        holeSegment: gameRes.data.hole_segment,
        sourceGameId: gameRes.data.source_game_id,
        tournamentId: gameRes.data.tournament_id,
      }),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error(`[${LOG_PREFIX}] load threw`, err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
