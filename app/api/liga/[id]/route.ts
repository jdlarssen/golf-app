import { after, NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { getAdminClient } from '@/lib/supabase/admin';
import { getLigaSnapshot } from '@/lib/league/getLigaSnapshot';
import { canViewLeague } from '@/lib/league/canViewLeague';
import { maybeAutoConfirmLeagueParticipation } from '@/lib/league/confirmLeagueParticipation';
import { buildAppLeagueView } from '@/lib/league/buildAppLeagueView';
import type { AppLeagueParticipantDetails } from '@/lib/league/appLeagueView';
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
// Medspillerlista på «Start runden» viser HCP og initialer (tegning 5). Det
// fulle navnet og `hcp_index` til ligaens deltakere leses med service role,
// slik nettets ligaside leser navnene (`getLigaSnapshot`): bare de to
// kolonnene, bare ligaens deltakere, og bare når kalleren selv er deltaker,
// etter porten (orkestratorens avgjørelse 25.10). RLS på `users` viser bare
// rader du har delt et spill med, så en ligakamerat du aldri har spilt med,
// er usynlig for bruker-klienten. Alle andre som får se ligaen, får `null`.
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

    const details = meRes.data ? await readParticipantDetails(admin, id) : null;

    if (meRes.data && meRes.data.accepted_at == null) {
      after(() => maybeAutoConfirmLeagueParticipation({ leagueId: id, userId }));
    }
    return NextResponse.json(buildAppLeagueView(snapshot, userId, details));
  } catch (err) {
    console.error('[api/liga/[id]] load failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}

/**
 * Det fulle navnet og HCP-en til ligaens deltakere, for en kaller som selv er
 * deltaker (se over). En lesefeil kaster, så ruta svarer 500.
 */
async function readParticipantDetails(
  admin: ReturnType<typeof getAdminClient>,
  leagueId: string,
): Promise<Map<string, AppLeagueParticipantDetails>> {
  const { data, error } = await admin
    .from('league_players')
    .select('user_id, users!league_players_user_id_fkey(name, hcp_index)')
    .eq('league_id', leagueId);
  if (error) throw new Error(`participant details read failed: ${error.message}`);
  const out = new Map<string, AppLeagueParticipantDetails>();
  for (const row of (data ?? []) as Array<{
    user_id: string;
    users: { name: string | null; hcp_index: number | null } | null;
  }>) {
    out.set(row.user_id, {
      fullName: row.users?.name?.trim() || null,
      hcpIndex: row.users?.hcp_index ?? null,
    });
  }
  return out;
}
