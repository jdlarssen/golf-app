import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';
import { LigaManagement } from '@/app/admin/liga/[id]/LigaManagement';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string; ligaId: string }>;

/**
 * /klubber/[id]/liga/[ligaId] — the club owner/admin's door into managing their
 * own club league (#485), inside AppShell with no admin chrome. Renders the same
 * shared <LigaManagement> as /admin/liga/[id], just with variant="club".
 *
 * The gate resolves the league's club from its group_id, so a non-manager (or
 * someone aiming at another club's / a standalone league) is redirected; RLS on
 * leagues/league_rounds/league_players is the security backstop on every write.
 * `id` is the club; `ligaId` is the league — we gate on the league.
 */
export default async function KlubbLigaManagePage({ params }: { params: Params }) {
  const { ligaId } = await params;
  const supabase = await getServerClient();
  const { userId } = await requireAdminOrClubAdminOfLeague(supabase, ligaId);
  return <LigaManagement leagueId={ligaId} userId={userId} variant="club" />;
}
