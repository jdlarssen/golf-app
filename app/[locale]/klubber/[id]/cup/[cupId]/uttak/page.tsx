import { CupLineupRoom } from '@/app/[locale]/admin/cup/[id]/uttak/CupLineupRoom';

type Params = Promise<{ id: string; cupId: string }>;

/**
 * /klubber/[id]/cup/[cupId]/uttak — kaptein-uttaket i klubb-chrome (#1884).
 * Gjenbruker det delte rommet (variant club), som gater på cup-rollen selv —
 * en kaptein er ikke klubb-admin og ville blitt kastet ut av den vanlige
 * `requireAdminOrClubAdminOfCup`-gaten søsterrommene bruker.
 */
export default async function KlubbCupLineupPage({ params }: { params: Params }) {
  const { id, cupId } = await params;
  return <CupLineupRoom tournamentId={cupId} variant="club" groupId={id} />;
}
