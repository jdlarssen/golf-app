import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';
import { LigaRemoveConfirm } from '../LigaRemoveConfirm';

type Params = Promise<{ id: string; userId: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * /admin/liga/[id]/fjern/[userId] — global-admin door to the remove-player
 * confirm page (#2244). Club admins use /klubber/[id]/liga/[ligaId]/fjern/[userId];
 * both render the shared <LigaRemoveConfirm>. Gated like the sibling /slett.
 */
export default async function RemoveLigaPlayerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id, userId } = await params;
  const sp = await searchParams;

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfLeague(supabase, id);

  return (
    <LigaRemoveConfirm
      leagueId={id}
      userId={userId}
      variant="admin"
      errorCode={first(sp.error)}
    />
  );
}
