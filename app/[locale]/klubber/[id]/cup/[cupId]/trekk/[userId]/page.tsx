import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupWithdrawConfirm } from '@/app/[locale]/admin/cup/[id]/trekk/CupWithdrawConfirm';

type Params = Promise<{ id: string; cupId: string; userId: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * `/klubber/[id]/cup/[cupId]/trekk/[userId]` — samme flyt i klubb-chrome
 * (#1814), speiler `/slett`-varianten.
 */
export default async function KlubbCupWithdrawPage({
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
    <CupWithdrawConfirm
      tournamentId={cupId}
      userId={userId}
      variant="club"
      errorCode={first(sp.error)}
    />
  );
}
