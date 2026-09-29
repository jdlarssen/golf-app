import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { modeCollapsesToTeamCard, type GameMode } from '@/lib/scoring/modes/types';

/**
 * The viewer's own stroke entries + course handicap for one finished game —
 * the raw inputs `computeRoundScore` turns into brutto/netto.
 */
export type RoundScoreInputs = {
  strokes: (number | null)[];
  courseHandicap: number | null;
  /**
   * #2273: the team shared one ball (`modeCollapsesToTeamCard` on hole 18).
   * The strokes are the team's, stored on the captain, so they are nobody's
   * own round: `strokes` is always empty and the row shows «Lagrunde».
   */
  teamBall: boolean;
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
 *
 * #2273: a game where the team shares one ball gets `teamBall: true` and no
 * strokes, for every player on the team (the rule is the format, not who owns
 * the rows). A derived game follows its host's mode, since the host's rows are
 * the ones it reads.
 */
export async function getRoundScoresForGames(
  supabase: SupabaseClient<Database>,
  userId: string,
  gameIds: string[],
): Promise<Map<string, RoundScoreInputs>> {
  const result = new Map<string, RoundScoreInputs>();
  for (const id of gameIds) {
    result.set(id, { strokes: [], courseHandicap: null, teamBall: false });
  }
  if (gameIds.length === 0) return result;

  const { data: gamesRows, error: gamesError } = await supabase
    .from('games')
    .select('id, source_game_id, game_mode')
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
    markTeamBallRounds(supabase, result, gamesRows ?? [], scoresGameIdFor),
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
      if (entry && !entry.teamBall) entry.strokes.push(s.strokes);
    }
  }
  return result;
}

/**
 * #2273: sets `teamBall` on every entry. The mode that counts is the one of
 * the game whose rows hold the strokes: the host for a derived game, else the
 * game itself. Hosts that weren't requested are looked up here; a host the
 * viewer can't read falls back to the game's own mode.
 */
async function markTeamBallRounds(
  supabase: SupabaseClient<Database>,
  result: Map<string, RoundScoreInputs>,
  gamesRows: { id: string; source_game_id: string | null; game_mode: string }[],
  scoresGameIdFor: Map<string, string>,
): Promise<void> {
  const modeById = new Map<string, GameMode>(
    gamesRows.map((g) => [g.id, g.game_mode as GameMode]),
  );
  const hostIds = [...new Set(scoresGameIdFor.values())].filter(
    (id) => !modeById.has(id),
  );
  if (hostIds.length > 0) {
    const { data, error } = await supabase
      .from('games')
      .select('id, game_mode')
      .in('id', hostIds);
    if (error) throw error;
    for (const h of data ?? []) modeById.set(h.id, h.game_mode as GameMode);
  }
  for (const [requestedId, entry] of result) {
    const mode =
      modeById.get(scoresGameIdFor.get(requestedId) ?? requestedId) ??
      modeById.get(requestedId);
    entry.teamBall = mode != null && modeCollapsesToTeamCard(mode, 18);
  }
}
