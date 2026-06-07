import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';
import { LigaManagement } from './LigaManagement';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

/**
 * /admin/liga/[id] — global-admin door into league management (#485).
 * Klubb-admins reach the same surface via /klubber/[id]/liga/[ligaId]; both
 * routes render the shared <LigaManagement>. Gate first, then hand the caller's
 * userId to the component (it owns all data-fetching).
 */
export default async function LigaDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await getServerClient();
  const { userId } = await requireAdminOrClubAdminOfLeague(supabase, id);
  return <LigaManagement leagueId={id} userId={userId} variant="admin" />;
}
