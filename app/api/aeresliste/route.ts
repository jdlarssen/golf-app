import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId } from '@/lib/api/appAuth';
import { buildAeresliste, type AereslisteView } from '@/lib/stats/aeresliste';
import { getRareShotsAllTime } from '@/lib/stats/getRareShotsAllTime';
import { getRareShotOptOuts } from '@/lib/stats/rareShotOptOuts';

// Æreslista i appen (#2894 PR 2): hver hole-in-one og albatross i Tørny, alle år, nyeste
// først. Skjermen, banneret på Hjem og lenka i kortet «Sjeldne slag» leser denne.
//
// Appen leser ikke slagene selv: klienten ser bare spillene brukeren var med i (RLS, #1542).
// Ruta leser derfor med service-rollen bak `authenticatedUserId` og sender bare kortnavn
// («Marte L.»), hull, bane, dato og en ugjennomsiktig nøkkel; se `lib/stats/aeresliste.ts`.
// En spiller som har slått av «Del sjeldne slag med alle» (0238), står ikke på lista, heller
// ikke for seg selv. Valget leses uten cache, og feiler den lesingen, feiler hele svaret
// (500) i stedet for å vise noen som har sagt nei.
//
// AUTH: `authenticatedUserId`; id-en kommer bare fra det validerte tokenet.
//
// WIRE (frosset — appen speiler `AereslisteView`):
//   GET 200 AereslisteView { rows: [{ kind, name, initials, isViewer, hole, courseName, playedOn, key }] }
//       401 { error: 'unauthorized' }
//       500 { error: 'load_failed' }
// Feil-bodyene er faste koder, aldri `err.message`.

const LOG_PREFIX = 'api/aeresliste';

type ErrorBody = { error: 'unauthorized' | 'load_failed' };

export async function GET(request: NextRequest) {
  try {
    const userId = await authenticatedUserId(request);
    if (!userId) {
      const body: ErrorBody = { error: 'unauthorized' };
      return NextResponse.json(body, { status: 401 });
    }

    const [shots, optOuts] = await Promise.all([getRareShotsAllTime(), getRareShotOptOuts()]);
    const body: AereslisteView = buildAeresliste({
      moments: shots.moments,
      optOuts,
      viewerUserId: userId,
      names: new Map(shots.names),
      nicknames: new Map(shots.nicknames),
    });
    return NextResponse.json(body);
  } catch (err) {
    console.error(`[${LOG_PREFIX}] load failed`, err);
    const body: ErrorBody = { error: 'load_failed' };
    return NextResponse.json(body, { status: 500 });
  }
}
