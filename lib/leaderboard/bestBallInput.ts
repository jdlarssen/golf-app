import type { LbHole, LbPlayer, LbScore } from '@/lib/leaderboard';
import { playerStrokeHandicap } from '@/lib/scoring/allocatedStrokes';
import type { GameMode, GameModeConfig, ScoringGender } from '@/lib/scoring/modes/types';

/** The roster fields the best-ball surfaces read. Structural, so `gwp.players` fits. */
export type BestBallRosterRow = {
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null } | null;
};

export type BestBallHoleInputRow = {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

export type BestBallScoreInputRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

/**
 * Input til `computeLeaderboard` for best ball-flatene: tavla, «Hull for hull»
 * og CSV-eksporten (#2217 D3). Reglene sto før bare i tavla
 * (`leaderboardContent.tsx`, WD #386), så de to andre regnet med en trukket
 * spillers slag i lagets best ball og viste en annen total og plass.
 *
 * - `players`: har `users`-rad og er ikke trukket
 * - `withdrawn`: har `users`-rad og er trukket (tavlas «Trukket»-seksjon)
 * - `scores`: slag fra trukne spillere er droppet
 * - `holes`: `par` er `par_mens`, pluss par per kjønn
 *
 * `courseHandicap` følger motoren (`playerStrokeHandicap`, #2218). For best ball
 * er det det rå banehandicapet, som tavla alltid har brukt.
 *
 * Hjelperen segmentfiltrerer ikke: kallstedet sender inn rader som allerede er
 * filtrert på spillets `hole_segment`.
 */
export function bestBallBoardInput(opts: {
  gameMode: GameMode;
  modeConfig: GameModeConfig;
  roster: readonly BestBallRosterRow[];
  holeRows: readonly BestBallHoleInputRow[];
  scoreRows: readonly BestBallScoreInputRow[];
  unknownPlayer: string;
}): {
  players: LbPlayer[];
  withdrawn: { user_id: string; display_name: string }[];
  holes: LbHole[];
  scores: LbScore[];
} {
  const { gameMode, modeConfig, roster, holeRows, scoreRows, unknownPlayer } = opts;

  const withdrawn = roster
    .filter((p) => p.users != null && p.withdrawn_at != null)
    .map((p) => ({
      user_id: p.user_id,
      display_name: p.users!.name ?? unknownPlayer,
    }));
  const withdrawnIds = new Set(withdrawn.map((p) => p.user_id));

  const players: LbPlayer[] = roster
    .filter((p) => p.users != null && p.withdrawn_at == null)
    .map((p) => ({
      userId: p.user_id,
      name: p.users!.name ?? unknownPlayer,
      nickname: p.users!.nickname,
      teamNumber: p.team_number,
      courseHandicap: playerStrokeHandicap(gameMode, modeConfig, p.course_handicap ?? 0),
      teeGender: p.tee_gender,
    }));

  const holes: LbHole[] = holeRows.map((h) => ({
    holeNumber: h.hole_number,
    par: h.par_mens,
    parByGender: {
      mens: h.par_mens,
      ladies: h.par_ladies,
      juniors: h.par_juniors,
    },
    strokeIndex: h.stroke_index,
  }));

  const scores: LbScore[] = scoreRows
    .filter((s) => !withdrawnIds.has(s.user_id))
    .map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      strokes: s.strokes,
    }));

  return { players, withdrawn, holes, scores };
}
