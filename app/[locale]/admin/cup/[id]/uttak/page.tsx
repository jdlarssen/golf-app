import { CupLineupRoom } from './CupLineupRoom';

// #1894: the server action on this page writes a whole cup's matches in
// sequence (insertCupMatches), and its compensating rollback cannot survive a
// timeout. Set on the page, this limit covers the page's server actions.
export const maxDuration = 60;

type Params = Promise<{ id: string }>;

/**
 * /admin/cup/[id]/uttak — kaptein-uttaket i admin-chrome (#1884).
 *
 * Ingen `requireAdmin*`-gate her med vilje: rommet er også kapteinenes, og de
 * er ikke admins. `CupLineupRoom` gater selv på cup-rollen.
 */
export default async function CupLineupPage({ params }: { params: Params }) {
  const { id } = await params;
  return <CupLineupRoom tournamentId={id} variant="admin" />;
}
