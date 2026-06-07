import type {
  ScoringContext,
  GameModeConfig,
  ScoringGender,
} from '@/lib/scoring/modes/types';

/**
 * Rå spiller-rad fra `game_players`-joinen — felles form for både
 * leaderboard-flaten (`renderSkins`) og «Hull for hull»-flaten
 * (`SkinsHolesBody`). Trukket ut så de to flatene deler én kilde (epic #496).
 */
export interface SkinsContextPlayerRow {
  user_id: string;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  users: { name: string | null; nickname: string | null } | null;
}

export interface SkinsContextHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

export interface SkinsContextScoreRow {
  user_id: string;
  hole_number: number;
  strokes: number | null;
}

/**
 * Bygger `ScoringContext` for Skins fra rå DB-rader.
 *
 * Trukket ut av `renderSkins` (leaderboard/page.tsx) slik at både
 * leaderboard-flaten og «Hull for hull»-flaten bygger konteksten likt fra
 * samme kilde — ingen duplisert map-logikk (epic #496).
 *
 * Skins-validatoren setter `team_number = null` (solo), men DB-kolonnen er
 * ikke nullable så den lander som 0. Vi sender `null` oppover for å matche
 * scoring-lagets solo-narrowing — samme mønster som Nassau.
 */
export function buildSkinsContext(opts: {
  gameId: string;
  modeConfig: GameModeConfig;
  players: SkinsContextPlayerRow[];
  holesRows: SkinsContextHoleRow[];
  scoresRows: SkinsContextScoreRow[];
}): ScoringContext {
  const { gameId, modeConfig, players, holesRows, scoresRows } = opts;
  return {
    game: {
      id: gameId,
      game_mode: 'skins',
      mode_config: modeConfig,
    },
    players: players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        teamNumber: null,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
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
    scores: scoresRows.map((s) => ({
      userId: s.user_id,
      holeNumber: s.hole_number,
      gross: s.strokes,
    })),
  };
}
