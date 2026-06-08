import type {
  ScoringContext,
  GameModeConfig,
  ScoringGender,
  BingoBangoBongoHoleInput,
} from '@/lib/scoring/modes/types';

/**
 * Rå spiller-rad fra `game_players`-joinen — felles form for både
 * leaderboard-flaten (`renderBingoBangoBongo`) og «Hull for hull»-flaten
 * (`BingoBangoBongoHolesBody`). Trukket ut så de to flatene deler én kilde
 * (epic #496).
 */
export interface BingoBangoBongoContextPlayerRow {
  user_id: string;
  course_handicap: number | null;
  tee_gender: ScoringGender;
  users: { name: string | null; nickname: string | null } | null;
}

export interface BingoBangoBongoContextHoleRow {
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
}

export interface BingoBangoBongoContextScoreRow {
  user_id: string;
  hole_number: number;
  strokes: number | null;
}

/**
 * Bygger `ScoringContext` for Bingo Bango Bongo fra rå DB-rader, inkludert
 * per-hull-prestasjonsdata fra `bingo_bango_bongo_holes` (`bingoBangoBongoHoles`).
 *
 * Trukket ut av `renderBingoBangoBongo` (leaderboard/page.tsx) slik at både
 * leaderboard-flaten og «Hull for hull»-flaten bygger konteksten likt fra
 * samme kilde — ingen duplisert map-logikk (epic #496).
 *
 * BBB er et solo-format: validatoren setter `team_number = null` (DB-kolonnen
 * lander som 0), så vi sender `null` oppover for solo-narrowing — som Skins/
 * Nines/Acey-Deucey. Slag (`scoresRows`) sendes gjennom for shape-konsistens
 * selv om BBB-compute ignorerer dem (poeng er rene prestasjons-poeng). Den
 * faktiske poeng-inputen er `bingoBangoBongoHoles` — injectet som Wolf sin
 * `wolfChoices`.
 */
export function buildBingoBangoBongoContext(opts: {
  gameId: string;
  modeConfig: GameModeConfig;
  players: BingoBangoBongoContextPlayerRow[];
  holesRows: BingoBangoBongoContextHoleRow[];
  scoresRows: BingoBangoBongoContextScoreRow[];
  bingoBangoBongoHoles: BingoBangoBongoHoleInput[];
}): ScoringContext {
  const {
    gameId,
    modeConfig,
    players,
    holesRows,
    scoresRows,
    bingoBangoBongoHoles,
  } = opts;
  return {
    game: {
      id: gameId,
      game_mode: 'bingo_bango_bongo',
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
    bingoBangoBongoHoles,
  };
}
