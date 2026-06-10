import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { GenerateMatches } from '@/app/[locale]/admin/cup/[id]/generer/GenerateMatches';

type Params = Promise<{ id: string; cupId: string }>;

/**
 * /klubber/[id]/cup/[cupId]/generer — match-generering i klubb-chrome (#524).
 * Gjenbruker den delte GenerateMatches-komponenten (variant club). Gaten slår
 * opp cupens klubb; ikke-styrer redirectes (RLS backstop på match-insert).
 */
export default async function KlubbCupGenerateMatchesPage({
  params,
}: {
  params: Params;
}) {
  const { cupId } = await params;
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, cupId);
  return <GenerateMatches tournamentId={cupId} variant="club" />;
}
