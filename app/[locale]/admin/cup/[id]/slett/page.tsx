import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupDeleteConfirm } from './CupDeleteConfirm';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

export default async function DeleteCupPage({
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
    <CupDeleteConfirm
      tournamentId={id}
      variant="admin"
      errorCode={first(sp.error)}
    />
  );
}
