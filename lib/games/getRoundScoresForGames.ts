import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * The viewer's own stroke entries + course handicap for one finished game —
 * the raw inputs `computeRoundScore` turns into brutto/netto.
 */
export type RoundScoreInputs = {
  strokes: (number | null)[];
  courseHandicap: number | null;
};

/**
 * Fetches the viewer's strokes + course handicap for a SMALL set of finished
 * games, so Hjem (#986) can show brutto/netto on the «Runder»-rows without
 * loading scores for every finished game. Mirrors the historikk fetch: scores
 * scoped to the viewer with non-null strokes, `course_handicap` from the
 * viewer's `game_players` row. Returns an entry for every requested id (empty
 * strokes / null handicap when the player has none), so callers can map without
 * null-checking the map.
 */
export async function getRoundScoresForGames(
  supabase: SupabaseClient<Database>,
  userId: string,
  gameIds: string[],
): Promise<Map<string, RoundScoreInputs>> {
  const result = new Map<string, RoundScoreInputs>();
  for (const id of gameIds) {
    result.set(id, { strokes: [], courseHandicap: null });
  }
  if (gameIds.length === 0) return result;

  const [scoresRes, playersRes] = await Promise.all([
    supabase
      .from('scores')
      .select('game_id, strokes')
      .eq('user_id', userId)
      .in('game_id', gameIds)
      .not('strokes', 'is', null),
    supabase
      .from('game_players')
      .select('game_id, course_handicap')
      .eq('user_id', userId)
      .in('game_id', gameIds),
  ]);

  if (scoresRes.error) throw scoresRes.error;
  if (playersRes.error) throw playersRes.error;

  for (const p of playersRes.data ?? []) {
    const entry = result.get(p.game_id);
    if (entry) entry.courseHandicap = p.course_handicap;
  }
  for (const s of scoresRes.data ?? []) {
    const entry = result.get(s.game_id);
    if (entry) entry.strokes.push(s.strokes);
  }
  return result;
}
