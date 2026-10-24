import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { canViewLeague } from '@/lib/league/canViewLeague';
import { buildAppLeagueView } from '@/lib/league/buildAppLeagueView';
import { isUuid } from '@/lib/url/isUuid';

// Ligasiden i appen (#2638): det samme webbens `/liga/[id]` viser. Tabellen
// og rundeinnstillingene regnes på serveren, i `getLigaSnapshot`, og appen
// regner dem aldri selv. `buildAppLeagueView` gjør snapshotet om til den
// flate formen appen leser.
//
// AUTH: `authenticatedUserId` — id-en kommer bare fra det validerte tokenet.
// Tilgangen er den samme som på nettsiden (`canViewLeague`): en klubbliga
// bare for deltakerne, klubbens medlemmer og global admin, og en frittstående
// liga for alle innloggede. Medlemskapet leses som kalleren
// (`callerScopedClient`). En liga kalleren ikke får se, svarer 404 som en som
// ikke finnes, så ruta røper ikke at den finnes.
//
// WIRE (appen speiler den, `lib/league/appLeagueView.ts`):
//   GET 200 AppLeagueView
//       401 { error: 'unauthorized' }
//       404 { error: 'not_found' }
//       500 { error: 'load_failed' }

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const snapshot = await getLigaSnapshot(id);
    if (!snapshot) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const caller = callerScopedClient(request);
    if (!caller) throw new Error('caller-scoped client unavailable');
    const { allowed } = await canViewLeague(caller, {
      groupId: snapshot.league.group_id,
      userId,
      isParticipant: snapshot.participants.some((p) => p.userId === userId),
    });
    if (!allowed) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    return NextResponse.json(buildAppLeagueView(snapshot, userId));
  } catch (err) {
    console.error('[api/liga/[id]] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
