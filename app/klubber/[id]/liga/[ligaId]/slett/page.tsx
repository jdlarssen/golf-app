import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';
import { LigaDeleteConfirm } from '@/app/admin/liga/[id]/slett/LigaDeleteConfirm';


type Params = Promise<{ id: string; ligaId: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * /klubber/[id]/liga/[ligaId]/slett — club-scoped delete-confirm, so a club
 * owner/admin stays in club chrome through the whole flow (#485). Renders the
 * shared <LigaDeleteConfirm> with variant="club"; deleteLeague redirects back to
 * the club page on success. Gated on the league.
 */
export default async function KlubbLigaDeletePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { ligaId } = await params;
  const sp = await searchParams;

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfLeague(supabase, ligaId);

  return <LigaDeleteConfirm leagueId={ligaId} variant="club" errorCode={first(sp.error)} />;
}
