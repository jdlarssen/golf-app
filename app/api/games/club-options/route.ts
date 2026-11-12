import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { getAppClubOptions } from '@/lib/clubs/appClubOptions';

// «Klubb-turnering» i appen (#2753): om flisen vises, klubbene du kan sette opp
// en runde for, og medlemmene deres. Samme regel og samme oppslag som nettets
// veiviser (`getAppClubOptions`).
//
// AUTH: `authenticatedUserId`, id-en kommer bare fra det validerte tokenet, så
// ingen kan be om en annens klubber.
//
// WIRE (appen speiler den, `lib/clubs/appClubOptionsView.ts`):
//   GET 200 AppClubOptions · 401 unauthorized · 500 load_failed
export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return NextResponse.json(await getAppClubOptions(userId));
  } catch (err) {
    console.error('[api/games/club-options] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
