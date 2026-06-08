import type {
  ScoringContext,
  GameModeConfig,
  ScoringGender,
} from '@/lib/scoring/modes/types';

/**
 * Rå spiller-rad fra `game_players`-joinen — felles form for både
 * leaderboard-flaten (`renderSoloStrokeplay`) og «Hull for hull»-flaten
 * (`SoloStrokeplayHolesBody`). Trukket ut så de to flatene deler én kilde
 * (epic #496). Inkluderer `withdrawn_at` så WD-filtreringen gjøres ett sted.
 */
export interface SoloStrokeplayContextPlayerRow {
  user_id: string;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null } | null;
}

export interface SoloStrokeplayContextHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

export interface SoloStrokeplayContextScoreRow {
  user_id: string;
  hole_number: number;
  strokes: number | null;
}

/**
 * Bygger `ScoringContext` for solo strokeplay fra rå DB-rader.
 *
 * Trukket ut av `renderSoloStrokeplay` (leaderboard/page.tsx) slik at både
 * leaderboard-flaten og «Hull for hull»-flaten bygger konteksten likt fra
 * samme kilde — ingen duplisert map-logikk (epic #496). Speiler
 * `buildNassauContext`.
 *
 * WD (#386): trukket spillere (`withdrawn_at != null`) ekskluderes både fra
 * `players` og fra `scores`, ett sted, så begge konsumerende flater ser
 * nøyaktig samme felt. Solo-validatoren setter `team_number = null`, men DB-
 * kolonnen er ikke nullable så den lander som 0 — vi sender `null` oppover for
 * å matche scoring-lagets solo-narrowing.
 */
export function buildSoloStrokeplayContext(opts: {
  gameId: string;
  modeConfig: GameModeConfig;
  players: SoloStrokeplayContextPlayerRow[];
  holesRows: SoloStrokeplayContextHoleRow[];
  scoresRows: SoloStrokeplayContextScoreRow[];
}): ScoringContext {
  const { gameId, modeConfig, players, holesRows, scoresRows } = opts;

  const withdrawnIds = new Set(
    players.filter((p) => p.withdrawn_at != null).map((p) => p.user_id),
  );

  return {
    game: {
      id: gameId,
      game_mode: 'solo_strokeplay',
      mode_config: modeConfig,
    },
    players: players
      .filter((p) => p.users != null && p.withdrawn_at == null)
      .map((p) => ({
        userId: p.user_id,
        teamNumber: null,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
        // #240 — solo strokeplay ranker på netto-slag (gross − extra), ikke
        // par. Sender teeGender gjennom for shape-konsistens.
        teeGender: p.tee_gender,
      })),
    holes: holesRows.map((h) => ({
      number: h.hole_number,
      par: h.par_mens,
      parByGender: {
        mens: h.par_mens,
        ladies: h.par_ladies,
        juniors: h.par_juniors,
      },
      strokeIndex: h.stroke_index,
    })),
    scores: scoresRows
      .filter((s) => !withdrawnIds.has(s.user_id))
      .map((s) => ({
        userId: s.user_id,
        holeNumber: s.hole_number,
        gross: s.strokes,
      })),
  };
}
