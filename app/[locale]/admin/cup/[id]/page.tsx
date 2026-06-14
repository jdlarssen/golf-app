import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupManagement } from './CupManagement';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[]; status?: string | string[] }>;

export default async function CupDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, id);
  return (
    <CupManagement
      tournamentId={id}
      variant="admin"
      errorCode={first(sp.error)}
      statusCode={first(sp.status)}
    />
  );
}
