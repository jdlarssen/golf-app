import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { GenerateMatches } from './GenerateMatches';

type Params = Promise<{ id: string }>;

export default async function GenerateMatchesPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await getServerClient();
  // #526: personlig cup → skaper (eller admin) når denne siden; klubb-cup →
  // klubb-admin (eller admin). Matcher gaten i createCupMatchesFromPlan.
  await requireAdminOrClubAdminOfCup(supabase, id);
  return <GenerateMatches tournamentId={id} variant="admin" />;
}
