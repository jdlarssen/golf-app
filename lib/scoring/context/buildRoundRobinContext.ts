import type {
  ScoringContext,
  GameModeConfig,
  ScoringGender,
} from '@/lib/scoring/modes/types';

/**
 * Rå spiller-rad fra `game_players`-joinen — felles form for både
 * leaderboard-flaten (`renderRoundRobin`) og «Hull for hull»-flaten
 * (`RoundRobinHolesBody`). Trukket ut så de to flatene deler én kilde
 * (epic #496).
 */
export interface RoundRobinContextPlayerRow {
  user_id: string;
  /** Round Robin bruker team_number som slot A/B/C/D (1..4) — driver rotasjonen. */
  team_number: number | null;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  users: { name: string | null; nickname: string | null } | null;
}

export interface RoundRobinContextHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

export interface RoundRobinContextScoreRow {
  user_id: string;
  hole_number: number;
  strokes: number | null;
}

/**
 * Bygger `ScoringContext` for Round Robin fra rå DB-rader.
 *
 * Trukket ut av `renderRoundRobin` (leaderboard/page.tsx) slik at både
 * leaderboard-flaten og «Hull for hull»-flaten bygger konteksten likt fra
 * samme kilde — ingen duplisert map-logikk (epic #496).
 *
 * Round Robin-validatoren håndhever `team_number ∈ {1,2,3,4}` (unike slots
 * A/B/C/D), brukt av scoring-laget til å bestemme roterende konstellasjon per
 * segment. Sendes som-er (ikke null som Skins/Nines). Speiler `buildWolfContext`
 * minus `wolfChoices`-injeksjonen — rotasjonen er ren funksjon av slot + hull,
 * så ingen ekstra DB-kilde trengs.
 */
export function buildRoundRobinContext(opts: {
  gameId: string;
  modeConfig: GameModeConfig;
  players: RoundRobinContextPlayerRow[];
  holesRows: RoundRobinContextHoleRow[];
  scoresRows: RoundRobinContextScoreRow[];
}): ScoringContext {
  const { gameId, modeConfig, players, holesRows, scoresRows } = opts;
  return {
    game: {
      id: gameId,
      game_mode: 'round_robin',
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
  };
}
