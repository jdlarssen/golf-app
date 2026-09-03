import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupWithdrawConfirm } from '../CupWithdrawConfirm';

type Params = Promise<{ id: string; userId: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * `/admin/cup/[id]/trekk/[userId]` — arrangøren registrerer (eller angrer) et
 * trekk for én spiller (#1814). Gaten gjøres her; den delte komponenten
 * autoriserer ingenting selv.
 */
export default async function CupWithdrawPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id, userId } = await params;
  const sp = await searchParams;
  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfCup(supabase, id);
  return (
    <CupWithdrawConfirm
      tournamentId={id}
      userId={userId}
      variant="admin"
      errorCode={first(sp.error)}
    />
  );
}
