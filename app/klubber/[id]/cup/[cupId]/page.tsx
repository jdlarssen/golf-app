import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupManagement } from '@/app/admin/cup/[id]/CupManagement';

type Params = Promise<{ id: string; cupId: string }>;
type SearchParams = Promise<{ error?: string | string[]; status?: string | string[] }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * /klubber/[id]/cup/[cupId] — klubb-cup-styring i klubb-chrome (#524).
 * Gjenbruker den delte CupManagement-komponenten (variant club). Gaten slår opp
 * cupens klubb; ikke-styrer redirectes (RLS backstop på skriv).
 */
export default async function KlubbCupManagePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { cupId } = await params;
  const sp = await searchParams;
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, cupId);
  return (
    <CupManagement
      tournamentId={cupId}
      variant="club"
      errorCode={first(sp.error)}
      statusCode={first(sp.status)}
    />
  );
}
