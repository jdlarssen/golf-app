import { CupLineupRoom } from './CupLineupRoom';

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
