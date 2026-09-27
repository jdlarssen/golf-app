import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupRemoveConfirm } from '../CupRemoveConfirm';

type Params = Promise<{ id: string; userId: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * /admin/cup/[id]/spillere/fjern/[userId] — confirm page before removing a
 * participant from a cup (#2244). Club admins use the /klubber door; both render
 * the shared <CupRemoveConfirm>. Gated like the sibling Spillere room.
 */
export default async function RemoveCupParticipantPage({
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
    <CupRemoveConfirm
      tournamentId={id}
      userId={userId}
      variant="admin"
      errorCode={first(sp.error)}
    />
  );
}
