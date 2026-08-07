import { first } from '@/lib/url/searchParams';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfCup } from '@/lib/admin/auth';
import { CupParticipants } from '@/app/[locale]/admin/cup/[id]/spillere/CupParticipants';

type Params = Promise<{ id: string; cupId: string }>;
type SearchParams = Promise<{ status?: string | string[] }>;

/**
 * /klubber/[id]/cup/[cupId]/spillere — cup-deltakerliste i klubb-chrome
 * (#1472). Gjenbruker den delte CupParticipants-komponenten (variant club).
 * Gaten slår opp cupens klubb; ikke-styrer redirectes (RLS backstop på skriv).
 */
export default async function KlubbCupParticipantsPage({
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
    <CupParticipants
      tournamentId={cupId}
      variant="club"
      statusCode={first(sp.status)}
    />
  );
}
