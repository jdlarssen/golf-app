import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupDeleteConfirm } from '@/app/admin/cup/[id]/slett/CupDeleteConfirm';

type Params = Promise<{ id: string; cupId: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * /klubber/[id]/cup/[cupId]/slett — slett klubb-cup i klubb-chrome (#524).
 * Gjenbruker den delte CupDeleteConfirm (variant club). deleteTournament
 * redirecter klubb-cup tilbake til klubb-siden.
 */
export default async function KlubbCupDeletePage({
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
    <CupDeleteConfirm
      tournamentId={cupId}
      variant="club"
      errorCode={first(sp.error)}
    />
  );
}
