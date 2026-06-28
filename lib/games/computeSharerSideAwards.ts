// lib/games/computeSharerSideAwards.ts
// Game-level async helper that fetches scoring data and returns up to `max`
// notable side-tournament awards for a sharer's result card (#942).
// Server-only — must not be imported into client components.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { SideCategoryId } from '@/lib/scoring/sideTournamentConfig';
import type { SideCategoryAward } from '@/lib/scoring/sideTournament';
import { computeLeaderboard } from '@/lib/leaderboard';
import type { LbPlayer, LbHole, LbScore } from '@/lib/leaderboard';
import { calculateSideTournament } from '@/lib/scoring/sideTournament';
import { buildSideTournamentInput } from '@/lib/scoring/sideTournamentInput';
import { SIDE_CATEGORY_CARD_LABEL, selectNotableAwards } from './sideTournamentAwards';
import { COURSE_HOLES_SELECT, SCORES_SELECT } from '@/lib/supabase/queryFragments';
import type { CourseHoleRow, ScoreRow } from '@/lib/supabase/queryFragments';

// ---------------------------------------------------------------------------
// Types — mirroring what buildModeResultForGame + leaderboard page use.
// ---------------------------------------------------------------------------

/** Minimal game fields this helper needs — mirrors GameForHole's side fields. */
type SideAwardsGame = {
  id: string;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  course_id: string;
  side_tournament_enabled: boolean;
  side_ld_count: number;
  side_ctp_count: number;
  side_disabled_categories: SideCategoryId[] | null;
};

/** Shape of each returned award entry, ready for the card renderer. */
export type SharerSideAward = {
  label: string;
  winnerUserId: string | null;
};

// ---------------------------------------------------------------------------
// game_players row shape (same FK hint as getGameWithPlayers).
// ---------------------------------------------------------------------------

type GamePlayerRow = {
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  withdrawn_at: string | null;
  tee_gender: string;
  users: { name: string | null; nickname: string | null } | null;
};

type SideWinnerRow = {
  category: 'longest_drive' | 'closest_to_pin';
  position: number;
  winner_user_id: string | null;
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetches all game scoring data, runs the side-tournament engine, and returns
 * up to `max` notable awards for the sharer's result-card image.
 *
 * - Returns `[]` when `side_tournament_enabled` is false.
 * - When `sharerId` is null or not a participant, falls back to the field's
 *   notable awards across ALL teams (useful for a neutral/admin share card).
 * - `winnerUserId` on each returned entry is the sharer's userId when they
 *   own the award, otherwise the first member of the winning team — lets the
 *   caller resolve a name and set an `isSharer` highlight flag.
 *
 * @param client    Supabase client with enough privileges to read game data
 *                  (admin client bypasses RLS; cookie-based works for finished
 *                  games where RLS opens scores).
 * @param game      Minimal game fields — see `SideAwardsGame`.
 * @param sharerId  The card sharer's userId, or null for a neutral card.
 * @param max       Maximum number of awards to return.
 */
export async function computeSharerSideAwards(
  client: SupabaseClient<Database>,
  game: SideAwardsGame,
  sharerId: string | null,
  max: number,
): Promise<SharerSideAward[]> {
  if (!game.side_tournament_enabled) return [];

  // Fetch game_players, course_holes, scores, and side winners in parallel.
  // Mirror the fetch pattern from buildModeResultForGame / leaderboard page.
  const [playersRes, holesRes, scoresRes, sideWinnersRes] = await Promise.all([
    client
      .from('game_players')
      .select(
        'user_id, team_number, course_handicap, withdrawn_at, tee_gender, users!game_players_user_id_fkey(name, nickname)',
      )
      .eq('game_id', game.id)
      .returns<GamePlayerRow[]>(),
    client
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', game.course_id)
      .order('hole_number', { ascending: true })
      .returns<CourseHoleRow[]>(),
    client
      .from('scores')
      .select(SCORES_SELECT)
      .eq('game_id', game.id)
      .returns<ScoreRow[]>(),
    client
      .from('game_side_winners')
      .select('category, position, winner_user_id')
      .eq('game_id', game.id)
      .order('category')
      .order('position')
      .returns<SideWinnerRow[]>(),
  ]);

  if (playersRes.error) throw playersRes.error;
  if (holesRes.error) throw holesRes.error;
  if (scoresRes.error) throw scoresRes.error;
  if (sideWinnersRes.error) throw sideWinnersRes.error;

  const rawPlayers = playersRes.data ?? [];
  const rawHoles = holesRes.data ?? [];
  const rawScores = scoresRes.data ?? [];
  const sideWinnerRows = sideWinnersRes.data ?? [];

  // Filter withdrawn players and their scores — same as leaderboard page.
  const withdrawnIds = new Set(
    rawPlayers
      .filter((p) => p.withdrawn_at != null)
      .map((p) => p.user_id),
  );

  const players: LbPlayer[] = rawPlayers
    .filter((p) => p.users != null && p.withdrawn_at == null)
    .map((p) => ({
      userId: p.user_id,
      name: p.users!.name ?? 'Spiller',
      nickname: p.users!.nickname,
      teamNumber: p.team_number ?? 0,
      courseHandicap: p.course_handicap ?? 0,
      // teeGender is stored as a string in the DB; the LbPlayer type accepts
      // the ScoringGender union — cast safely (DB CHECK ensures valid values).
      teeGender: p.tee_gender as LbPlayer['teeGender'],
    }));

  const holes: LbHole[] = rawHoles.map((h) => ({
    holeNumber: h.hole_number,
    par: h.par_mens,
    parByGender: {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    },
    strokeIndex: h.stroke_index,
  }));

  const scores: LbScore[] = rawScores
    .filter((s) => !withdrawnIds.has(s.user_id))
    .map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      strokes: s.strokes,
    }));

  // Run the leaderboard in netto mode — side-tournament scoring is always netto.
  const nettoLines = computeLeaderboard({ mode: 'netto', players, holes, scores });

  // Build the SideTournamentInput from leaderboard output + course metadata.
  const input = buildSideTournamentInput({
    nettoLines,
    holes: holes.map((h) => ({
      holeNumber: h.holeNumber,
      par: h.par,
      strokeIndex: h.strokeIndex,
    })),
    ldCount: game.side_ld_count as 0 | 1 | 2,
    ctpCount: game.side_ctp_count as 0 | 1 | 2,
    disabledCategories: game.side_disabled_categories ?? [],
    sideWinnerRows,
  });

  const result = calculateSideTournament(input);

  // Find the sharer's TeamLine to locate their team in the standings.
  const sharerTeamLine =
    sharerId != null
      ? nettoLines.find((line) => line.players.some((p) => p.userId === sharerId))
      : null;

  // Choose whose awards to show.
  let candidateAwards: SideCategoryAward[];
  if (sharerTeamLine != null) {
    // Sharer found in a team — show their team's awards.
    const standing = result.teamStandings.find(
      (s) => s.teamId === sharerTeamLine.teamNumber,
    );
    candidateAwards = standing?.awards ?? [];
  } else {
    // Sharer not found (null sharerId, withdrawn, or non-participant) —
    // fall back to the field: flatten every team's awards.
    candidateAwards = result.teamStandings.flatMap((s) => s.awards);
  }

  const selected = selectNotableAwards(candidateAwards, max);

  // Map each selected award to a card entry.
  return selected.map((award) => {
    // Resolve winnerUserId: prefer the sharer when they own this award,
    // otherwise the first member of the winning team.
    let winnerUserId: string | null = null;
    if (sharerId != null && sharerTeamLine?.teamNumber === award.teamId) {
      winnerUserId = sharerId;
    } else {
      // Find the first userId on the award's team from the input.
      const inputTeam = input.teams.find((t) => t.teamId === award.teamId);
      winnerUserId = inputTeam?.userIds[0] ?? null;
    }

    return {
      label: SIDE_CATEGORY_CARD_LABEL[award.category],
      winnerUserId,
    };
  });
}
