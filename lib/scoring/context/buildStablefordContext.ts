import type {
  ScoringContext,
  GameModeConfig,
  ScoringGender,
} from '@/lib/scoring/modes/types';

/**
 * Rå spiller-rad fra `game_players`-joinen — felles form for både
 * leaderboard-flaten (`renderStableford`) og «Hull for hull»-flaten
 * (`SoloStablefordHolesBody`). Trukket ut så de to flatene deler én kilde
 * (epic #496). Inkluderer `team_number` (par-stableford) + `withdrawn_at` (WD).
 */
export interface StablefordContextPlayerRow {
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null } | null;
}

export interface StablefordContextHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

export interface StablefordContextScoreRow {
  user_id: string;
  hole_number: number;
  strokes: number | null;
}

/**
 * Bygger `ScoringContext` for stableford / modified stableford fra rå DB-rader.
 *
 * Trukket ut av `renderStableford` (leaderboard/page.tsx) slik at både
 * leaderboard-flaten (solo OG team) og «Hull for hull»-flaten bygger konteksten
 * likt fra samme kilde — ingen duplisert map-logikk (epic #496).
 *
 * Tre stableford-spesifikke detaljer den eier:
 *  - **game_mode-passthrough:** sender det reelle `gameMode` (stableford vs
 *    modified_stableford) gjennom så mode-router-en velger riktig poeng-tabell.
 *    Begge returnerer `kind: 'stableford'`.
 *  - **team-variant teamNumber:** ved `team_size === 2` (par-stableford) sendes
 *    `team_number` gjennom for lag-gruppering; ved solo sendes `null`.
 *  - **WD-filtrering (#386):** trukne spillere ekskluderes fra både `players`
 *    og `scores`, ett sted, så begge flatene ser samme felt.
 */
export function buildStablefordContext(opts: {
  gameId: string;
  gameMode: 'stableford' | 'modified_stableford';
  modeConfig: GameModeConfig;
  players: StablefordContextPlayerRow[];
  holesRows: StablefordContextHoleRow[];
  scoresRows: StablefordContextScoreRow[];
}): ScoringContext {
  const { gameId, gameMode, modeConfig, players, holesRows, scoresRows } = opts;

  const isTeamVariant =
    (modeConfig.kind === 'stableford' ||
      modeConfig.kind === 'modified_stableford') &&
    modeConfig.team_size === 2;

  const withdrawnIds = new Set(
    players.filter((p) => p.withdrawn_at != null).map((p) => p.user_id),
  );

  return {
    game: {
      id: gameId,
      game_mode: gameMode,
      mode_config: modeConfig,
    },
    players: players
      .filter((p) => p.users != null && p.withdrawn_at == null)
      .map((p) => ({
        userId: p.user_id,
        teamNumber: isTeamVariant ? p.team_number : null,
        flightNumber: null,
        courseHandicap: p.course_handicap ?? 0,
        // #240 — per-kjønn-par resolveres via parFor(hole, teeGender) i
        // scoring-modulen. Sender tee_gender gjennom for riktig par-variant.
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
