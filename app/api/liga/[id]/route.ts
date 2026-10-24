import { after, NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { getAdminClient } from '@/lib/supabase/admin';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { canViewLeague } from '@/lib/league/canViewLeague';
import { maybeAutoConfirmLeagueParticipation } from '@/lib/league/confirmLeagueParticipation';
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
// liga for alle innloggede. Porten kjøres FØR snapshotet: den trenger bare
// ligaens klubb og kallerens egen deltakerrad, så hele ligaen leses aldri med
// service role for en som ikke får se den. Medlemskapet leses som kalleren
// (`callerScopedClient`). En liga kalleren ikke får se, svarer 404 som en som
// ikke finnes, så ruta røper ikke at den finnes. En lesefeil er 500, aldri 404.
//
// Som nettsiden bekrefter ruta deltakelsen når en deltaker åpner ligaen
// (#463, `maybeAutoConfirmLeagueParticipation`), så en som bare bruker appen
// ikke blir stående som «Ikke bekreftet». Det skjer etter svaret (`after`).
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

    const admin = getAdminClient();
    const [leagueRes, meRes] = await Promise.all([
      admin.from('leagues').select('group_id').eq('id', id).maybeSingle(),
      admin
        .from('league_players')
        .select('accepted_at')
        .eq('league_id', id)
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    if (leagueRes.error || meRes.error) {
      throw new Error(`gate read failed: ${leagueRes.error?.message ?? meRes.error?.message}`);
    }
    if (!leagueRes.data) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const caller = callerScopedClient(request);
    if (!caller) throw new Error('caller-scoped client unavailable');
    const { allowed } = await canViewLeague(caller, {
      groupId: leagueRes.data.group_id,
      userId,
      isParticipant: meRes.data !== null,
    });
    if (!allowed) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const snapshot = await getLigaSnapshot(id);
    if (!snapshot) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (meRes.data && meRes.data.accepted_at == null) {
      after(() => maybeAutoConfirmLeagueParticipation({ leagueId: id, userId }));
    }
    return NextResponse.json(buildAppLeagueView(snapshot, userId));
  } catch (err) {
    console.error('[api/liga/[id]] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
