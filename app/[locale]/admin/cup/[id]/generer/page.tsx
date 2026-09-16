import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { GenerateMatches } from './GenerateMatches';

// #1894: the server action on this page writes a whole cup's matches in
// sequence (insertCupMatches), and its compensating rollback cannot survive a
// timeout. Set on the page, this limit covers the page's server actions.
export const maxDuration = 60;

type Params = Promise<{ id: string }>;

export default async function GenerateMatchesPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await getServerClient();
  // #526: personlig cup → skaper (eller admin) når denne siden; klubb-cup →
  // klubb-admin (eller admin). Matcher gaten i createCupMatchesFromPlan.
  await requireAdminOrClubAdminOfCup(supabase, id);
  return <GenerateMatches tournamentId={id} variant="admin" />;
}
