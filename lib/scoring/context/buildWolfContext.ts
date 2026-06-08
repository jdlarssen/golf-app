import type {
  ScoringContext,
  GameModeConfig,
  ScoringGender,
  WolfHoleChoice,
} from '@/lib/scoring/modes/types';

/**
 * Rå spiller-rad fra `game_players`-joinen — felles form for både
 * leaderboard-flaten (`renderWolf`) og «Hull for hull»-flaten
 * (`WolfHolesBody`). Trukket ut så de to flatene deler én kilde (epic #496).
 */
export interface WolfContextPlayerRow {
  user_id: string;
  /** Wolf bruker team_number som rotasjons-slot 1..n. */
  team_number: number | null;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  users: { name: string | null; nickname: string | null } | null;
}

export interface WolfContextHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

export interface WolfContextScoreRow {
  user_id: string;
  hole_number: number;
  strokes: number | null;
}

/**
 * Bygger `ScoringContext` for Wolf fra rå DB-rader, inkludert per-hull-valgene
 * fra `wolf_hole_choices` (`wolfChoices`).
 *
 * Trukket ut av `renderWolf` (leaderboard/page.tsx) slik at både
 * leaderboard-flaten og «Hull for hull»-flaten bygger konteksten likt fra
 * samme kilde — ingen duplisert map-logikk (epic #496).
 *
 * Wolf-validatoren håndhever `team_number ∈ {1..n}` (unike, sammenhengende),
 * brukt som rotasjons-slot. Defensiv fallback til 0 hvis kolonnen mot
 * formodning er null — scoring-laget håndterer det grasiøst.
 */
export function buildWolfContext(opts: {
  gameId: string;
  modeConfig: GameModeConfig;
  players: WolfContextPlayerRow[];
  holesRows: WolfContextHoleRow[];
  scoresRows: WolfContextScoreRow[];
  wolfChoices: WolfHoleChoice[];
}): ScoringContext {
  const { gameId, modeConfig, players, holesRows, scoresRows, wolfChoices } =
    opts;
  return {
    game: {
      id: gameId,
      game_mode: 'wolf',
      mode_config: modeConfig,
    },
    players: players
      .filter((p) => p.users != null)
      .map((p) => ({
        userId: p.user_id,
        teamNumber: p.team_number ?? 0,
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
    wolfChoices,
  };
}
