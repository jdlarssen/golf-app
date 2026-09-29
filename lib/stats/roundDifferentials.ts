import { computeScoreDifferential } from '@/lib/scoring/scoreDifferential';
import {
  modeCollapsesToTeamCard,
  type GameMode,
  type ScoringGender,
} from '@/lib/scoring/modes/types';
import { getRatingForGender, type TeeBoxRatings } from '@/lib/games/teeRating';
import { parForGender } from '@/lib/stats/achievements';
import type { CourseHoleRow } from '@/lib/supabase/queryFragments';

/** En komplett 18-hulls-runde (alle 18 hull registrert). */
const COMPLETE_ROUND_HOLES = 18;

/** Det historikk-siden vet om ett avsluttet spill, fra spillerens ståsted. */
export type DifferentialGame = {
  id: string;
  /** Spillemodus — avgjør om laget delte én ball (#2273). */
  game_mode: GameMode;
  course_id: string | null;
  tee_box_id: string | null;
  /** Strokes received — banehandicapet i spillet. */
  course_handicap: number | null;
  /** Frosset WHS-differensial (null = ikke frosset ennå → live-beregnes). */
  score_differential: number | null;
  /** Antall hull spilleren selv har slag på. */
  holeCount: number;
};

export type DifferentialScoreRow = {
  hole_number: number;
  strokes: number | null;
};

export type DifferentialDeps = {
  teeById: Map<string, TeeBoxRatings>;
  genderByGame: Map<string, ScoringGender | null>;
  holesByCourse: Map<string, Map<number, CourseHoleRow>>;
  scoresByGame: Map<string, DifferentialScoreRow[]>;
};

/**
 * #941 — WHS score-differensial per komplett 18-hulls-runde. Frosset verdi
 * (`game_players.score_differential`) vinner; ellers beregnes den live fra rå
 * runde-data (samme `computeScoreDifferential` som fryse-helperen — formelen bor
 * ett sted). Runder uten 18 hull, slope/CR eller banehandicap hoppes over.
 * `toFreeze` lister live-beregnede runder som bør lazy-fryses.
 *
 * #2273: runder der laget delte én ball (`modeCollapsesToTeamCard` på hull 18)
 * hoppes over FØR den frosne verdien leses. Slagene ligger på kapteinen, men er
 * lagets ball, så runden gir ingen personlig differensial — heller ikke en som
 * ble frosset før regelen kom. Samme regel som Kavalkaden.
 */
export function computeDifferentials(
  games: DifferentialGame[],
  deps: DifferentialDeps,
): {
  byGame: Map<string, number>;
  toFreeze: { gameId: string; differential: number }[];
} {
  const byGame = new Map<string, number>();
  const toFreeze: { gameId: string; differential: number }[] = [];
  for (const game of games) {
    if (game.holeCount !== COMPLETE_ROUND_HOLES) continue;
    if (modeCollapsesToTeamCard(game.game_mode, 18)) continue;
    if (game.score_differential != null) {
      byGame.set(game.id, game.score_differential);
      continue;
    }
    const tee =
      game.tee_box_id != null ? deps.teeById.get(game.tee_box_id) : undefined;
    const gender = deps.genderByGame.get(game.id) ?? null;
    const rating = tee ? getRatingForGender(tee, gender ?? 'mens') : null;
    if (!rating) continue;
    const perHole = game.course_id
      ? deps.holesByCourse.get(game.course_id)
      : undefined;
    const scoreByHole = new Map(
      (deps.scoresByGame.get(game.id) ?? []).map((s) => [
        s.hole_number,
        s.strokes,
      ]),
    );
    const holes = Array.from({ length: COMPLETE_ROUND_HOLES }, (_, i) => {
      const holeRow = perHole?.get(i + 1);
      if (!holeRow) return null;
      return {
        strokes: scoreByHole.get(i + 1) ?? null,
        par: parForGender(holeRow, gender),
        strokeIndex: holeRow.stroke_index,
      };
    });
    if (holes.some((h) => h === null)) continue;
    const differential = computeScoreDifferential({
      holes: holes as {
        strokes: number | null;
        par: number;
        strokeIndex: number;
      }[],
      courseHandicap: game.course_handicap,
      slope: rating.slope,
      courseRating: rating.courseRating,
    });
    if (differential == null) continue;
    byGame.set(game.id, differential);
    toFreeze.push({ gameId: game.id, differential });
  }
  return { byGame, toFreeze };
}
