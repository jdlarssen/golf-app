import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/url/isUuid';
import { loadMarkerChoice } from '@/lib/league/setFlightMarkerCore';
import type { MarkerOptionsResponse } from '@/lib/league/appLeagueView';

// Markørvalget før appen leverer et kort i en simulatorliga (#2661).
//
// Det samme nettets leveringsside viser (`loadMarkerChoice`): ligaens
// medlemmer unntatt den som leverer, flightkameratene først (#2814). Kortene
// jeg har ført for flighten, overleveres og er ikke med i leveringen, så en
// flightkamerat kan velges. Har en flightkamerat ført mitt kort og er markøren
// min, eller er kortet levert, er det ingen velger (`required: false`).
// Serveren sjekker valget på nytt ved leveringen (`submit-team`), så lista er
// et tilbud, ikke porten.
//
// AUTH: Bearer-tokenet (`authenticatedUserId`). Bare en aktiv spiller i
// spillet får lista, så ruta ikke røper navnene i en liga til en fremmed.
// En ukjent spill-id og et spill kalleren ikke er med i svarer begge 404.
//
// WIRE (appen speiler den, `native/app/src/data/marker.ts`):
//   GET ?alsoFor=<uuid>,<uuid>   makkerkortene (valgfri, 0–20). Godtas så eldre
//                                appbygg ikke får 400, men påvirker ikke lista
//                                (#2814)
//       200 MarkerOptionsResponse (lib/league/appLeagueView.ts):
//           { required: false } utenfor en simulatorliga,
//           { required: false, returnedBy: { userId, name } } når markøren
//             sendte kortet tilbake (#2814): det går tilbake til samme markør,
//           { required: true, options: { userId, name }[] } i en
//       400 bad_request · 401 unauthorized · 404 not_found · 500 load_failed

const MAX_ALSO_FOR = 20;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id: gameId } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(gameId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const raw = request.nextUrl.searchParams.get('alsoFor');
    const alsoFor = raw ? raw.split(',').filter(Boolean) : [];
    if (alsoFor.length > MAX_ALSO_FOR || !alsoFor.every(isUuid)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const { data: me, error } = await getAdminClient()
      .from('game_players')
      .select('user_id')
      .eq('game_id', gameId)
      .eq('user_id', userId)
      .is('withdrawn_at', null)
      .maybeSingle();
    if (error) throw new Error(`player read failed: ${error.message}`);
    if (!me) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const choice = await loadMarkerChoice(gameId, userId);
    const body: MarkerOptionsResponse = choice?.options
      ? { required: true, options: choice.options }
      : choice?.returnedBy
        ? { required: false, returnedBy: choice.returnedBy }
        : { required: false };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/games/[id]/marker-options] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
