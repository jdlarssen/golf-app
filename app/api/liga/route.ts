import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getMyLeagues } from '@/lib/league/getMyLeagues';
import type { AppLeagueListResponse } from '@/lib/league/appLeagueView';

// «Ligaene dine» på appens Hjem (#2638): ligaene kalleren er med i, som er
// `draft` eller `active`, med den åpne runden og om kalleren har levert den
// eller er i gang. Sammenstillingen bor i `getMyLeagues`.
//
// AUTH: `authenticatedUserId` — id-en kommer bare fra det validerte tokenet,
// aldri fra query eller kropp. Lesingen er avgrenset til kallerens egne
// `league_players`-rader.
//
// WIRE (appen speiler den, `lib/league/appLeagueView.ts`):
//   GET 200 { leagues: AppLeagueSummary[] }
//       401 { error: 'unauthorized' }
//       500 { error: 'load_failed' }   (appen skjuler da seksjonen)

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body: AppLeagueListResponse = { leagues: await getMyLeagues(userId) };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/liga] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
