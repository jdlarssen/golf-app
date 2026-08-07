import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupParticipants } from './CupParticipants';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ status?: string | string[] }>;

export default async function CupParticipantsPage({
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
    <CupParticipants
      tournamentId={id}
      variant="admin"
      statusCode={first(sp.status)}
    />
  );
}
