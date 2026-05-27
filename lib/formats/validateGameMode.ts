import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

// Validerer at en game_mode-slug refererer et aktivt format. Brukes av
// server-actions som oppretter games (erstatter dropped games_mode_check
// CHECK-constraint introdusert i 0030 + utvidet i 0033, droppet i 0045).
//
// Ikke cachet — fersk lesning per call siden formats.is_active kan flippes
// hvilken som helst tid via admin og en stale cache ville være farlig her.
// Read er billig (PK-lookup på slug).
export async function isValidActiveGameMode(slug: string): Promise<boolean> {
  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('formats')
    .select('slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[isValidActiveGameMode] query failed', { slug, error });
    return false;
  }
  return data !== null;
}
