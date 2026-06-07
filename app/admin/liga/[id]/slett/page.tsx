import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';
import { LigaDeleteConfirm } from './LigaDeleteConfirm';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * /admin/liga/[id]/slett — global-admin delete-confirm door. Klubb-admins use
 * /klubber/[id]/liga/[ligaId]/slett; both render the shared <LigaDeleteConfirm>.
 */
export default async function DeleteLigaPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfLeague(supabase, id);

  return <LigaDeleteConfirm leagueId={id} variant="admin" errorCode={first(sp.error)} />;
}
