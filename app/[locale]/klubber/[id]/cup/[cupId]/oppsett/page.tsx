import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupPlanSetup } from '@/app/[locale]/admin/cup/[id]/oppsett/CupPlanSetup';

type Params = Promise<{ id: string; cupId: string }>;

/**
 * /klubber/[id]/cup/[cupId]/oppsett — cup-oppsett i klubb-chrome (#1472).
 * Gjenbruker den delte CupPlanSetup-komponenten (variant club). Gaten slår opp
 * cupens klubb; ikke-styrer redirectes (RLS backstop på skriv).
 */
export default async function KlubbCupPlanSetupPage({
  params,
}: {
  params: Params;
}) {
  const { cupId } = await params;
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, cupId);
  return <CupPlanSetup tournamentId={cupId} variant="club" />;
}
