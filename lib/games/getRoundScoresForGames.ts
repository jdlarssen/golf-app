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
 *
 * #1441: a DERIVED game (e.g. a back9 singles match) has no own scores rows
 * — without a redirect, its entry would fall back to `strokes: []` and the
 * row would render brutto/netto as "—" (computeRoundScore's null-safe empty
 * case, not a crash — but a needlessly blank number when the real strokes
 * are one query away). Resolves each requested id's `source_game_id` first
 * and fetches scores from the host instead; `course_handicap` stays scoped
 * to the requested game's own `game_players` row (netto must use THAT
 * match's handicap, e.g. a 100%-allowance derived singles match, not the
 * host's 85%-allowance best-ball handicap).
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

  const { data: gamesRows, error: gamesError } = await supabase
    .from('games')
    .select('id, source_game_id')
    .in('id', gameIds);
  if (gamesError) throw gamesError;

  // requestedId → the game_id scores actually live under (itself, unless derived).
  const scoresGameIdFor = new Map<string, string>();
  for (const id of gameIds) scoresGameIdFor.set(id, id);
  for (const g of gamesRows ?? []) {
    scoresGameIdFor.set(g.id, g.source_game_id ?? g.id);
  }
  const scoresGameIds = [...new Set(scoresGameIdFor.values())];

  const [scoresRes, playersRes] = await Promise.all([
    supabase
      .from('scores')
      .select('game_id, strokes')
      .eq('user_id', userId)
      .in('game_id', scoresGameIds)
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

  // Fan each fetched score row back out to every requested id whose
  // scores redirect points at that row's game_id (usually just itself).
  const requestersByScoresGameId = new Map<string, string[]>();
  for (const [requestedId, redirectId] of scoresGameIdFor) {
    const arr = requestersByScoresGameId.get(redirectId) ?? [];
    arr.push(requestedId);
    requestersByScoresGameId.set(redirectId, arr);
  }
  for (const s of scoresRes.data ?? []) {
    for (const requestedId of requestersByScoresGameId.get(s.game_id) ?? []) {
      const entry = result.get(requestedId);
      if (entry) entry.strokes.push(s.strokes);
    }
  }
  return result;
}
