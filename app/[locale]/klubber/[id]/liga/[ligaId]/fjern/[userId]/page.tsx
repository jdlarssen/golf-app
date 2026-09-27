import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';
import { LigaRemoveConfirm } from '@/app/[locale]/admin/liga/[id]/fjern/LigaRemoveConfirm';

type Params = Promise<{ id: string; ligaId: string; userId: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

/**
 * /klubber/[id]/liga/[ligaId]/fjern/[userId] — club-scoped remove-player
 * confirm page (#2244), so a club owner/admin stays in club chrome. Renders the
 * shared <LigaRemoveConfirm> with variant="club". Gated on the league, like the
 * sibling /slett.
 */
export default async function KlubbLigaRemovePlayerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { ligaId, userId } = await params;
  const sp = await searchParams;

  const supabase = await getServerClient();
  await requireAdminOrClubAdminOfLeague(supabase, ligaId);

  return (
    <LigaRemoveConfirm
      leagueId={ligaId}
      userId={userId}
      variant="club"
      errorCode={first(sp.error)}
    />
  );
}
