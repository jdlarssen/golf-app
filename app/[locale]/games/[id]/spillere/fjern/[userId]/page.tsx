import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrCreator } from '@/lib/admin/auth';
import { RemovePlayerConfirm } from '../RemovePlayerConfirm';

type Params = Promise<{ id: string; userId: string }>;

/**
 * /games/[id]/spillere/fjern/[userId] — confirm page before the organiser
 * removes a player from a round that has not started (audit 2026-11-20).
 * Gated like «Styr spillere» itself.
 */
export default async function RemoveGamePlayerPage({ params }: { params: Params }) {
  const { id, userId } = await params;
  const supabase = await getServerClient();
  const role = await requireAdminOrCreator(supabase, id);
  return <RemovePlayerConfirm gameId={id} userId={userId} isAdmin={role.isAdmin} />;
}
