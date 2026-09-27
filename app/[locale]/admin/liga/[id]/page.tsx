import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';
import { LigaManagement } from './LigaManagement';


type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ status?: string | string[] }>;

/**
 * /admin/liga/[id] — global-admin door into league management (#485).
 * Klubb-admins reach the same surface via /klubber/[id]/liga/[ligaId]; both
 * routes render the shared <LigaManagement>. Gate first, then hand the caller's
 * userId to the component (it owns all data-fetching).
 */
export default async function LigaDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await getServerClient();
  const { userId } = await requireAdminOrClubAdminOfLeague(supabase, id);
  return (
    <LigaManagement
      leagueId={id}
      userId={userId}
      variant="admin"
      statusCode={first(sp.status)}
    />
  );
}
