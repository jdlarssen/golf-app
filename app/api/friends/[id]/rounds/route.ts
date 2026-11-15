import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { readFriendIds } from '@/lib/friends/getFriendIds';
import { getSharedRounds } from '@/lib/friends/getSharedRounds';
import { headToHeadRecord } from '@/lib/friends/headToHead';

// Vennesiden i appen (#2381): rundene du og én venn har spilt sammen, og
// hvordan det har gått mellom dere («Mot hverandre»).
//
// **Bare for venner.** Lesingen går med admin-klienten og leser den andres
// `team_number` og `result_summary` (`getSharedRounds`), så personvernet hviler
// på sjekken her, ikke på RLS. Er `id` ikke en godtatt venn av kalleren, også
// en ventende forespørsel, et forslag eller deg selv, svarer ruta 403 før noe
// om den andre leses. En som ikke er venn, ser aldri mer enn ligaarket viser.
// `readFriendIds` kaster ved en lesefeil, så «vet ikke» blir 500, aldri 403.
//
// Bare merket forlater serveren, aldri plassering, lag eller sammendrag.
//
// AUTH: `authenticatedUserId` — kalleren er id-en fra det validerte tokenet,
// aldri fra adressen.
//
// WIRE (frosset — appen speiler den; feltene legges bare til):
//   GET 200 { rounds: SharedRound[], record: Record }
//       SharedRound = { gameId, name, playedAt: string | null, modeLabel,
//                       badge: 'you_ahead' | 'them_ahead' | 'same_team'
//                              | 'tied' | null }
//                     (nyeste først; de samme rundene «N runder sammen» teller)
//       Record      = { played, youAhead, themAhead, tied }
//                     (`played` = foran + bak + likt; lag og ligaflight teller ikke)
//       401 { error: 'unauthorized' }
//       403 { error: 'not_friends' }
//       500 { error: 'load_failed' }

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const friendIds = await readFriendIds(userId);
    if (id === userId || !friendIds.includes(id)) {
      return NextResponse.json({ error: 'not_friends' }, { status: 403 });
    }

    const rounds = await getSharedRounds(userId, id);
    return NextResponse.json({ rounds, record: headToHeadRecord(rounds.map((r) => r.badge)) });
  } catch (err) {
    console.error('[api/friends/[id]/rounds] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
