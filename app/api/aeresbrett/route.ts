import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { osloParts } from '@/lib/format/teeOff';
import { buildAeresbrettView, type AeresbrettView } from '@/lib/stats/appAeresbrettView';
import { getCurrentSeasonWins } from '@/lib/stats/getFinishedGameWins';
import { getSeasonBirdies } from '@/lib/stats/getSeasonBirdies';

// Æresbrettet i appen (#2259): sesongens topp 10 i flest seire, flest birdies og
// flest runder, for hele Tørny, pluss spillerens egen plass.
//
// Appen leser ikke tallene selv: klienten ser bare spillene brukeren var med i
// (RLS, #1542), og brettet teller alle. Ruta leser derfor med service-rollen bak
// `authenticatedUserId` og sender bare tall og kortnavn («Marte L.») videre; se
// `lib/stats/appAeresbrettView.ts` for hva som aldri forlater serveren.
//
// AUTH: `authenticatedUserId`; id-en kommer bare fra det validerte tokenet, aldri
// fra query eller kropp.
//
// WIRE (frosset — appen speiler `AeresbrettView`):
//   GET 200 AeresbrettView { seasonYear, seasonOver, boards: { wins, birdies, rounds } }
//       401 { error: 'unauthorized' }
//       500 { error: 'load_failed' }
//
// Feiler bare birdie-lesingen, logges den og `boards.birdies` blir `null`; de to
// andre fanene virker. Feil-bodyene er faste koder, aldri `err.message`.

const LOG_PREFIX = 'api/aeresbrett';

type ErrorBody = { error: 'unauthorized' | 'load_failed' };

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) {
      const body: ErrorBody = { error: 'unauthorized' };
      return NextResponse.json(body, { status: 401 });
    }

    const { season, wins } = await getCurrentSeasonWins();

    let birdies: Array<[string, number]> | null = null;
    if (season !== null) {
      try {
        birdies = await getSeasonBirdies({ seasonYear: season });
      } catch (err) {
        console.error(`[${LOG_PREFIX}] birdies failed`, err);
      }
    } else {
      birdies = [];
    }

    const body: AeresbrettView = buildAeresbrettView({
      seasonYear: season,
      currentYear: osloParts(new Date()).year,
      viewerUserId: userId,
      wins: wins.winnerCounts,
      rounds: wins.participationCounts,
      birdies,
      names: wins.userNames,
      nicknames: wins.userNicknames,
    });
    return NextResponse.json(body);
  } catch (err) {
    console.error(`[${LOG_PREFIX}] load failed`, err);
    const body: ErrorBody = { error: 'load_failed' };
    return NextResponse.json(body, { status: 500 });
  }
}
