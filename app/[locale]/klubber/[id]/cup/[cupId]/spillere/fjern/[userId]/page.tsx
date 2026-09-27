import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupRemoveConfirm } from '@/app/[locale]/admin/cup/[id]/spillere/fjern/CupRemoveConfirm';

type Params = Promise<{ id: string; cupId: string; userId: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * /klubber/[id]/cup/[cupId]/spillere/fjern/[userId] — the same confirm page in
 * club chrome (#2244), mirroring the sibling Spillere room. Gated on the cup.
 */
export default async function KlubbCupRemoveParticipantPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { cupId, userId } = await params;
  const sp = await searchParams;
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, cupId);
  return (
    <CupRemoveConfirm
      tournamentId={cupId}
      userId={userId}
      variant="club"
      errorCode={first(sp.error)}
    />
  );
}
