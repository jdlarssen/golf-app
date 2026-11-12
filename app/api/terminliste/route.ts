import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { buildAppTerminView, type AppTerminView } from '@/lib/games/appTerminView';
import { getDiscoverableGames } from '@/lib/games/getDiscoverableGames';
import { getGamesSocialProof } from '@/lib/games/getGameSocialProof';
import { getRegistrationSeats } from '@/lib/games/getRegistrationSeats';

// «Finn turneringer» i appen (#2838): terminlista, de samme tre lesingene som
// nettsidens /finn-turneringer (`app/[locale]/finn-turneringer/page.tsx`), satt
// sammen av `buildAppTerminView`. Dager og filtre regner appen selv.
//
// AUTH: `authenticatedUserId`; id-en kommer bare fra det validerte tokenet,
// aldri fra query eller kropp. Lesingen er den samme som nettsidens for denne
// brukeren, så ruta viser aldri en runde nettsiden ikke ville vist.
//
// WIRE (appen speiler den, `lib/games/appTerminView.ts`):
//   GET 200 AppTerminView { entries, pendingRequests }
//       401 { error: 'unauthorized' }
//       500 { error: 'load_failed' }   (appen viser feilen med «Prøv igjen»)

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const data = await getDiscoverableGames(userId);
    const listed = [...data.clubGames, ...data.friendGames, ...data.openGames];
    const [socialProof, seats] = await Promise.all([
      getGamesSocialProof(
        listed.map((game) => game.id),
        userId,
      ),
      getRegistrationSeats(listed),
    ]);

    const body: AppTerminView = buildAppTerminView(data, seats, socialProof);
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/terminliste] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
