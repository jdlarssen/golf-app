import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupPlanSetup } from './CupPlanSetup';

type Params = Promise<{ id: string }>;

export default async function CupPlanSetupPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, id);
  return <CupPlanSetup tournamentId={id} variant="admin" />;
}
