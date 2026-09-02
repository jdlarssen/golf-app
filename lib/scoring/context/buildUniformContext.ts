import type {
  ScoringContext,
  GameMode,
  GameModeConfig,
  ScoringGender,
} from '@/lib/scoring/modes/types';

/**
 * Rå spiller-rad slik den uniforme byggingen leser den. Strukturell type, som
 * hos søsknene i denne mappa — kallstedene sender sine egne rad-typer inn.
 *
 * `team_number` er `number`, ikke `number | null`: kolonnen ER nullable i prod
 * (#844), men nullen kollapses ÉN gang på normaliseringsgrensen
 * (`buildModeResultFromData`s `?? 0`, appens `toPlayerRows`). Den typen holder
 * grensen der den er, i stedet for å la nullen sive ned hit.
 */
export interface UniformContextPlayerRow {
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null } | null;
}

export interface UniformContextHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

export interface UniformContextScoreRow {
  user_id: string;
  hole_number: number;
  strokes: number | null;
}

/**
 * Uniform context for lag-/side-modi uten dedikert builder — best ball,
 * matchplay-familien, scramble-familien, shamble og patsome. Alle er
 * lag-/side-format der `team_number` alltid er satt, så WD-filtrering +
 * felt-map er nok; ingen av dem trenger mode-spesifikk lag-logikk.
 *
 * Speiler leaderboard-sidens inline-mapping (`teamNumber` verbatim,
 * `flightNumber: null`, WD-filtrert på både spillere og scores).
 *
 * **Filtreringen bor her** (#1831): trukne spillere og rader uten `users`-join
 * lukes ut i hjelperen, ikke hos kalleren, så både webbens
 * `buildModeResultForGame` og native-appens adapter ser nøyaktig samme felt.
 * Kallsteder som allerede filtrerer selv får et no-op — ikke en annen regel.
 *
 * Merk asymmetrien i filtrene, den er bevisst og delt med
 * `buildStablefordContext`: `players` lukes på `users != null &&
 * withdrawn_at == null`, mens `scores` lukes KUN på de trukne. En
 * `users == null`-rad som ikke er trukket mister altså spiller-raden, men
 * beholder scorene sine.
 *
 * Import-ren med vilje (ingen `server-only`): native-appen importerer denne
 * modulen direkte, slik at regelen har ett hjem i stedet for to.
 */
export function buildUniformContext(opts: {
  gameId: string;
  gameMode: GameMode;
  modeConfig: GameModeConfig;
  players: UniformContextPlayerRow[];
  holesRows: UniformContextHoleRow[];
  scoresRows: UniformContextScoreRow[];
}): ScoringContext {
  const { gameId, gameMode, modeConfig, players, holesRows, scoresRows } = opts;

  const withdrawnIds = new Set(
    players.filter((p) => p.withdrawn_at != null).map((p) => p.user_id),
  );

  return {
    game: { id: gameId, game_mode: gameMode, mode_config: modeConfig },
    players: players
      .filter((p) => p.users != null && p.withdrawn_at == null)
      .map((p) => ({
        userId: p.user_id,
        teamNumber: p.team_number,
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
    scores: scoresRows
      .filter((s) => !withdrawnIds.has(s.user_id))
      .map((s) => ({
        userId: s.user_id,
        holeNumber: s.hole_number,
        gross: s.strokes,
      })),
  };
}
