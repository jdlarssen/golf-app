import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { GenerateMatches } from './GenerateMatches';

type Params = Promise<{ id: string }>;

export default async function GenerateMatchesPage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await getServerClient();
  await requireAdmin(supabase);
  return <GenerateMatches tournamentId={id} variant="admin" />;
}
