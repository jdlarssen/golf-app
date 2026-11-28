/**
 * Golfåret for generalprøven av Kavalkaden (#3020, epic #1040).
 *
 * Ett rigget år med kjente scorekort. `golfaar3020.test.ts` kjører den ekte
 * fakta-byggeren på det og sjekker hvert tall mot `GOLFAAR_FASIT`, som er regnet
 * for hånd (regnestykkene står ved hvert tall). `scripts/kavalkade-generalproeve.ts`
 * skriver det samme året til staging, så siden kan åpnes mot fasiten.
 *
 * Alle navn er oppdiktet. Alle spillere har spillehandicap 0 i hver runde, så
 * netto er brutto og stableford-poeng er 2 + par − slag (minst 0). Det holder
 * håndregningen kort. Banen har par 72, og et hull uten oppføring er spilt på
 * par.
 *
 * Det året viser, sett fra Aud (A), som åpner Kavalkaden:
 *  - seire: Aud og Bjørn har 2 hver (Aud er med i likheten);
 *  - birdier: Dag, Cecilie og Maximiliansebastians har 3 hver (fornavnet på 20 tegn);
 *  - snowman: Bjørn, Dag, Cecilie og Eli har 1 hver (fire like, «og 1 til»);
 *  - Eli har nøyaktig én runde, Finn ingen i 2026;
 *  - én lagrunde (Texas scramble), én ligaflight (gir aldri seier), én runde på
 *    9 hull, én runde avsluttet etter frysegrensen og én runde i 2025.
 */
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import { stampNewGameModeConfig } from '@/lib/games/modeConfigEdit';

export type GolfaarPlayerKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export type GolfaarPlayer = {
  /** Fullt navn, slik det står i `users.name`. Kortet viser «Aud A.». */
  name: string;
  /** Navnet kortet viser (`kavalkadeCardName`). */
  cardName: string;
  /** Har sagt ja til AI-tekster (`ai_consents.granted = true`). */
  aiConsent: boolean;
};

export const GOLFAAR_PLAYERS: Record<GolfaarPlayerKey, GolfaarPlayer> = {
  A: { name: 'Aud Andersen', cardName: 'Aud A.', aiConsent: true },
  B: { name: 'Bjørn Berg', cardName: 'Bjørn B.', aiConsent: true },
  C: { name: 'Cecilie Carlsen', cardName: 'Cecilie C.', aiConsent: false },
  D: { name: 'Dag Dahl', cardName: 'Dag D.', aiConsent: false },
  E: { name: 'Eli Eng', cardName: 'Eli E.', aiConsent: false },
  F: { name: 'Finn Fjeld', cardName: 'Finn F.', aiConsent: false },
  // Fornavnet har 20 tegn (#3020 B1).
  G: { name: 'Maximiliansebastians Gran', cardName: 'Maximiliansebastians G.', aiConsent: false },
};

/** Banen: par 72 (36 + 36), med indeks per hull. */
export const GOLFAAR_COURSE = {
  name: 'Generalprøvebanen',
  holes: [
    { hole: 1, par: 4, strokeIndex: 7 },
    { hole: 2, par: 4, strokeIndex: 11 },
    { hole: 3, par: 3, strokeIndex: 15 },
    { hole: 4, par: 5, strokeIndex: 1 },
    { hole: 5, par: 4, strokeIndex: 9 },
    { hole: 6, par: 4, strokeIndex: 3 },
    { hole: 7, par: 3, strokeIndex: 17 },
    { hole: 8, par: 4, strokeIndex: 13 },
    { hole: 9, par: 5, strokeIndex: 5 },
    { hole: 10, par: 4, strokeIndex: 8 },
    { hole: 11, par: 4, strokeIndex: 12 },
    { hole: 12, par: 3, strokeIndex: 16 },
    { hole: 13, par: 5, strokeIndex: 2 },
    { hole: 14, par: 4, strokeIndex: 10 },
    { hole: 15, par: 4, strokeIndex: 4 },
    { hole: 16, par: 3, strokeIndex: 18 },
    { hole: 17, par: 4, strokeIndex: 14 },
    { hole: 18, par: 5, strokeIndex: 6 },
  ],
  tee: { name: 'Gul', slope: 125, courseRating: 71.5, par: 72 },
} as const;

/** Slag på hull med avvik fra par. Hull som ikke står her, er spilt på par. */
type Strokes = Partial<Record<number, number>>;

export type GolfaarGame = {
  key: string;
  name: string;
  gameMode: GameMode;
  modeConfig: GameModeConfig;
  /** Planlagt utslag (`scheduled_tee_off_at`) — runde-datoen kortene viser. */
  teeOffAt: string;
  /** `ended_at`. Frysegrensen måles på denne. */
  endedAt: string;
  /** Ligaflight (`league_round_id` satt). En ligaflight gir aldri seier (#2712). */
  leagueFlight?: boolean;
  /** Hull spilt: 18, eller 9 (hull 1–9) for den korte runden. */
  holesPlayed: 18 | 9;
  players: { key: GolfaarPlayerKey; team?: 1 | 2 }[];
  /**
   * Slagene. Egen ball: per spiller. Lagball (Texas scramble): per lag, og bare
   * lagkapteinen (laveste `user_id` på laget) får scores-radene, som i appen.
   */
  strokes: Partial<Record<GolfaarPlayerKey | 'team1' | 'team2', Strokes>>;
  /** Det motoren skal lagre i `game_players.result_summary`, regnet for hånd. */
  expected: Partial<Record<GolfaarPlayerKey, ResultSummary>>;
};

const solo = stampNewGameModeConfig({ kind: 'solo_strokeplay', team_size: 1 } as GameModeConfig);
const place = (rank: number, fieldSize: number, isTeam = false): ResultSummary => ({
  kind: 'placement',
  rank,
  fieldSize,
  isTeam,
});

export const GOLFAAR_GAMES: GolfaarGame[] = [
  {
    // Slagspill. Brutto: Aud 72+2−1=73, Bjørn 72+1+1+1=75, Cecilie 72−1+4+1=76,
    // Maximiliansebastians 72−1+2+2+2+1=78. Aud vinner.
    key: 'g1',
    name: 'Vårslippet',
    gameMode: 'solo_strokeplay',
    modeConfig: solo,
    teeOffAt: '2026-03-15T10:00:00.000Z',
    endedAt: '2026-03-15T14:00:00.000Z',
    holesPlayed: 18,
    players: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'G' }],
    strokes: {
      A: { 2: 3, 7: 5 }, // birdie på 2; 7 er nemesis-hullet hennes
      B: { 7: 4, 10: 5, 14: 5 },
      C: { 4: 4, 5: 8, 11: 5 }, // birdie på 4, snowman på 5
      G: { 6: 6, 9: 7, 12: 2, 13: 7, 16: 4 }, // birdie på 12
    },
    expected: { A: place(1, 4), B: place(2, 4), C: place(3, 4), G: place(4, 4) },
  },
  {
    // Stableford, standard tabell. Poeng = 36 − slag over par (ingen hull er verre
    // enn +2). Bjørn 37 (71), Maximiliansebastians 34 (74), Aud 33 (75), Dag 32 (76).
    key: 'g2',
    name: 'Påskestableford',
    gameMode: 'stableford',
    modeConfig: stampNewGameModeConfig({
      kind: 'stableford',
      team_size: 1,
      points_table: 'standard',
    } as GameModeConfig),
    teeOffAt: '2026-04-12T08:00:00.000Z',
    endedAt: '2026-04-12T12:00:00.000Z',
    holesPlayed: 18,
    players: [{ key: 'A' }, { key: 'B' }, { key: 'D' }, { key: 'G' }],
    strokes: {
      A: { 7: 5, 15: 5 },
      B: { 13: 4 }, // birdie på 13
      D: { 3: 5, 5: 3, 10: 6, 17: 5 }, // birdie på 5
      G: { 2: 6, 9: 4, 11: 5 }, // birdie på 9
    },
    expected: { B: place(1, 4), G: place(2, 4), A: place(3, 4), D: place(4, 4) },
  },
  {
    // Singles matchplay, Aud mot Bjørn. Hull som avgjøres: 4 Bjørn (1 opp), 7 Bjørn
    // (2 opp), 10 Bjørn (3 opp), 14 Aud (2 opp), 16 Aud (1 opp), 17–18 delt.
    // Bjørn vinner 1up. Brutto: Aud 72+2−1+1=74, Bjørn 72−1+1=72.
    key: 'g3',
    name: 'Mai-matchen',
    gameMode: 'singles_matchplay',
    modeConfig: stampNewGameModeConfig({
      kind: 'singles_matchplay',
      team_size: 1,
      teams_count: 2,
    } as GameModeConfig),
    teeOffAt: '2026-05-10T08:00:00.000Z',
    endedAt: '2026-05-10T12:00:00.000Z',
    holesPlayed: 18,
    players: [
      { key: 'A', team: 1 },
      { key: 'B', team: 2 },
    ],
    strokes: {
      A: { 7: 5, 10: 5, 16: 2 }, // birdie på 16
      B: { 4: 4, 14: 5 }, // birdie på 4
    },
    expected: {
      A: { kind: 'matchplay', outcome: 'loss', margin: '1up' },
      B: { kind: 'matchplay', outcome: 'win', margin: '1up' },
    },
  },
  {
    // Nassau, brutto. Dag: ut 35, inn 35, totalt 70 — vinner alle tre (3 units).
    // Resten rangeres på plass i totalen: Aud 74, Cecilie 75, Maximiliansebastians 76.
    key: 'g4',
    name: 'Nassau i juni',
    gameMode: 'nassau',
    modeConfig: stampNewGameModeConfig({
      kind: 'nassau',
      team_size: 1,
      nassau_scoring: 'gross',
    } as GameModeConfig),
    teeOffAt: '2026-06-07T08:00:00.000Z',
    endedAt: '2026-06-07T12:00:00.000Z',
    holesPlayed: 18,
    players: [{ key: 'A' }, { key: 'C' }, { key: 'D' }, { key: 'G' }],
    strokes: {
      A: { 7: 5 }, // ut 38, inn 36
      C: { 5: 5, 8: 5, 13: 4, 17: 6 }, // ut 38, inn 37; birdie på 13
      D: { 2: 3, 11: 3 }, // birdie på 2 og 11
      G: { 1: 6, 6: 3, 14: 6, 18: 6 }, // ut 37, inn 39; birdie på 6
    },
    expected: { D: place(1, 4), A: place(2, 4), C: place(3, 4), G: place(4, 4) },
  },
  {
    // Texas scramble: Aud + Cecilie (lag 1) mot Bjørn + Dag (lag 2). Lag 1: 72−6=66,
    // lag 2: 72−4=68. Lag 1 vinner. En lagrunde gir ingen personlige birdier.
    key: 'g5',
    name: 'Sommerscramble',
    gameMode: 'texas_scramble',
    modeConfig: stampNewGameModeConfig({
      kind: 'texas_scramble',
      team_size: 2,
      teams_count: 2,
      team_handicap_pct: 25,
    } as GameModeConfig),
    teeOffAt: '2026-07-05T08:00:00.000Z',
    endedAt: '2026-07-05T12:00:00.000Z',
    holesPlayed: 18,
    players: [
      { key: 'A', team: 1 },
      { key: 'C', team: 1 },
      { key: 'B', team: 2 },
      { key: 'D', team: 2 },
    ],
    strokes: {
      team1: { 2: 3, 4: 4, 6: 3, 9: 4, 13: 4, 16: 2 },
      team2: { 4: 4, 9: 4, 13: 4, 15: 3 },
    },
    expected: {
      A: place(1, 2, true),
      C: place(1, 2, true),
      B: place(2, 2, true),
      D: place(2, 2, true),
    },
  },
  {
    // Ligaflight, slagspill. Aud 74 er først, men en ligaflight gir aldri seier.
    // Bjørn 72+1+2+1+1=77.
    key: 'g6',
    name: 'Ligarunde august',
    gameMode: 'solo_strokeplay',
    modeConfig: solo,
    teeOffAt: '2026-08-09T08:00:00.000Z',
    endedAt: '2026-08-09T12:00:00.000Z',
    leagueFlight: true,
    holesPlayed: 18,
    players: [{ key: 'A' }, { key: 'B' }],
    strokes: {
      A: { 7: 5 },
      B: { 2: 6, 7: 4, 8: 5, 15: 5 },
    },
    expected: { A: place(1, 2), B: place(2, 2) },
  },
  {
    // Ni hull (1–9, par 36). Eli: snowman på 4 (8 slag på par 5, +3) og birdie på
    // 2 og 6 (−2): 36+3−2=37. Aud 36+2=38, Dag 36+1+2=39. Eli vinner.
    key: 'g7',
    name: 'Ni hull før mørket',
    gameMode: 'solo_strokeplay',
    modeConfig: solo,
    teeOffAt: '2026-09-06T08:00:00.000Z',
    endedAt: '2026-09-06T10:00:00.000Z',
    holesPlayed: 9,
    players: [{ key: 'A' }, { key: 'D' }, { key: 'E' }],
    strokes: {
      A: { 7: 5 },
      D: { 1: 5, 8: 6 },
      E: { 2: 3, 4: 8, 6: 3 },
    },
    expected: { E: place(1, 3), A: place(2, 3), D: place(3, 3) },
  },
  {
    // Slagspill. Maximiliansebastians 73, Cecilie 74 (tetteste oppgjør: 1 slag),
    // Aud 75, Bjørn 77, Dag 78.
    key: 'g8',
    name: 'Oktoberrunden',
    gameMode: 'solo_strokeplay',
    modeConfig: solo,
    teeOffAt: '2026-10-04T08:00:00.000Z',
    endedAt: '2026-10-04T12:00:00.000Z',
    holesPlayed: 18,
    players: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }, { key: 'G' }],
    strokes: {
      A: { 7: 5, 13: 6 },
      B: { 4: 8, 7: 4, 12: 4 }, // snowman på 4
      C: { 2: 6, 9: 4, 14: 5 }, // birdie på 9
      D: { 1: 8, 10: 5, 18: 6 }, // snowman på 1
      G: { 3: 4 },
    },
    expected: {
      G: place(1, 5),
      C: place(2, 5),
      A: place(3, 5),
      B: place(4, 5),
      D: place(5, 5),
    },
  },
  {
    // Avsluttet 24.12 kl. 00.30 Oslo-tid, etter frysegrensen: teller ikke.
    // Bjørn med fem birdier og en seier ville ellers flyttet tre kort.
    key: 'g9',
    name: 'Julaftensrunden',
    gameMode: 'solo_strokeplay',
    modeConfig: solo,
    teeOffAt: '2026-12-23T19:00:00.000Z',
    endedAt: '2026-12-23T23:30:00.000Z',
    holesPlayed: 18,
    players: [{ key: 'A' }, { key: 'B' }],
    strokes: {
      B: { 1: 3, 2: 3, 3: 2, 4: 4, 5: 3 },
    },
    expected: { B: place(1, 2), A: place(2, 2) },
  },
  {
    // 2025: teller ikke i 2026. Finns eneste runde.
    key: 'g10',
    name: 'Fjorårets runde',
    gameMode: 'solo_strokeplay',
    modeConfig: solo,
    teeOffAt: '2025-06-15T08:00:00.000Z',
    endedAt: '2025-06-15T12:00:00.000Z',
    holesPlayed: 18,
    players: [{ key: 'A' }, { key: 'B' }, { key: 'F' }],
    strokes: {
      B: { 5: 5 },
      F: { 1: 3, 2: 3 },
    },
    expected: { F: place(1, 3), A: place(2, 3), B: place(3, 3) },
  },
];

/** Hullene en runde ble spilt på. */
export function golfaarHoles(game: GolfaarGame): number[] {
  return Array.from({ length: game.holesPlayed }, (_, i) => i + 1);
}

/** Par på et hull på banen. */
export function golfaarPar(hole: number): number {
  const row = GOLFAAR_COURSE.holes.find((h) => h.hole === hole);
  if (!row) throw new Error(`golfaar3020: no hole ${hole}`);
  return row.par;
}

/** Spilles runden med én ball per lag? (Texas scramble i dette året.) */
export function golfaarIsTeamBall(game: GolfaarGame): boolean {
  return game.gameMode === 'texas_scramble';
}

/**
 * Slagene en spiller eier i runden, hull for hull. I lagball eier kapteinen
 * (laveste id på laget) lagets slag og de andre ingen. `idOf` gir id-en riggen
 * eller testen bruker for spilleren.
 */
export function golfaarStrokesOf(
  game: GolfaarGame,
  key: GolfaarPlayerKey,
  idOf: (key: GolfaarPlayerKey) => string,
): { hole: number; strokes: number }[] {
  let overrides: Strokes | undefined;
  if (golfaarIsTeamBall(game)) {
    const me = game.players.find((p) => p.key === key);
    if (!me?.team) return [];
    const mates = game.players.filter((p) => p.team === me.team).map((p) => idOf(p.key));
    const captain = [...mates].sort()[0];
    if (captain !== idOf(key)) return [];
    overrides = game.strokes[me.team === 1 ? 'team1' : 'team2'];
  } else {
    overrides = game.strokes[key];
  }
  return golfaarHoles(game).map((hole) => ({
    hole,
    strokes: overrides?.[hole] ?? golfaarPar(hole),
  }));
}

// ---------------------------------------------------------------------------
// Fasiten, regnet for hånd
// ---------------------------------------------------------------------------

/** Det hvert kort skal vise for én spiller som åpner Kavalkaden. */
export type GolfaarFasit = {
  /** «Ditt år»-åpningen. */
  rounds: number;
  soloRounds: number;
  teamRounds: number;
  /** `null` = under terskelen (kortet «For få runder i år»). */
  personal: {
    bestRound: { game: string; brutto: number };
    nemesisHole: { hole: number; played: number; averageToPar: number; worstStrokes: number };
    rival: { name: string; met: number; decided: number; wins: number; losses: number; ties: number };
    formPeak: { averageBrutto: number; from: string; to: string; start: number; now: number; best: number };
  } | null;
  team: { rounds: number; bestBrutto: number; bestWith: string[]; mostRoundsWith: string[] } | null;
  /** `null` = ingen runder i året (tom kavalkade). */
  gang: {
    members: number;
    games: number;
    /** Navnene i visningsrekkefølge, og tallet. */
    winner: { names: string[]; count: number } | null;
    birdies: { names: string[]; count: number } | null;
    snowmen: { names: string[]; count: number } | null;
    tightest: { game: string; margin: number; leader: [string, number]; runnerUp: [string, number] } | null;
  } | null;
};

export const GOLFAAR_FASIT: Partial<Record<GolfaarPlayerKey, GolfaarFasit>> = {
  // Aud: alle åtte rundene i 2026 (g1–g8). g9 er etter frysegrensen, g10 i 2025.
  A: {
    rounds: 8, // g1–g8
    soloRounds: 7, // alle unntatt g5 (lagball)
    teamRounds: 1, // g5
    personal: {
      // Komplette 18: g1 73, g2 75, g3 74, g4 74, g6 74, g8 75 (g7 er 9 hull).
      bestRound: { game: 'Vårslippet', brutto: 73 },
      // Hull 7 (par 3) på 5 slag i alle sju rundene med egen ball, g7 medregnet.
      nemesisHole: { hole: 7, played: 7, averageToPar: 2, worstStrokes: 5 },
      // Bjørn: g1, g2, g3, g5, g6, g8 = 6 møter (Dag 5, Cecilie 4, Maximiliansebastians 4).
      // g1 1 mot 2 seier, g2 3 mot 1 tap, g3 matchplay tap, g5 lag 1 mot 2 seier,
      // g6 1 mot 2 seier (rival-regnskapet teller ligaflight), g8 3 mot 4 seier.
      rival: { name: 'Bjørn B.', met: 6, decided: 6, wins: 4, losses: 2, ties: 0 },
      // Vinduer à 3: 73+75+74=222, 75+74+74=223, 74+74+74=222, 74+74+75=223.
      // Første laveste vinner: g1–g3, snitt 222/3 = 74. Start 73, nå 75, beste 73.
      formPeak: { averageBrutto: 74, from: 'g1', to: 'g3', start: 73, now: 75, best: 73 },
    },
    // g5: lag 1 (Aud + Cecilie) 66. Én felles runde er under terskelen for «beste
    // lagkamerat» (2), så kortet viser «flest lagrunder med».
    team: { rounds: 1, bestBrutto: 66, bestWith: ['Cecilie C.'], mostRoundsWith: ['Cecilie C.'] },
    gang: {
      members: 6, // Aud, Bjørn, Cecilie, Dag, Eli, Maximiliansebastians
      games: 8,
      // Aud: g1, g5. Bjørn: g2, g3. Cecilie g5, Dag g4, Eli g7, Max. g8 (1 hver).
      // Aud åpner, så hun står først.
      winner: { names: ['Aud A.', 'Bjørn B.'], count: 2 },
      // Dag: g2 5, g4 2 og 11. Cecilie: g1 4, g4 13, g8 9. Max.: g1 12, g2 9, g4 6.
      // Aud 2, Bjørn 2, Eli 2. Rekkefølge: flest runder (Dag 5, Cecilie 4, Max. 4),
      // så navnet.
      birdies: { names: ['Dag D.', 'Cecilie C.', 'Maximiliansebastians G.'], count: 3 },
      // Cecilie g1 hull 5, Eli g7 hull 4, Bjørn g8 hull 4, Dag g8 hull 1.
      // Runder: Bjørn 6, Dag 5, Cecilie 4, Eli 1. Kortet: tre navn og «og 1 til».
      snowmen: { names: ['Bjørn B.', 'Dag D.', 'Cecilie C.', 'Eli E.'], count: 1 },
      // Marginer: g1 2, g2 3, g3 2, g4 4, g6 3, g8 1 (g7 er 9 hull og teller ikke).
      tightest: {
        game: 'Oktoberrunden',
        margin: 1,
        leader: ['Maximiliansebastians G.', 73],
        runnerUp: ['Cecilie C.', 74],
      },
    },
  },
  // Bjørn: g1, g2, g3, g5, g6, g8.
  B: {
    rounds: 6,
    soloRounds: 5,
    teamRounds: 1,
    personal: {
      // g1 75, g2 71, g3 72, g6 77, g8 77.
      bestRound: { game: 'Påskestableford', brutto: 71 },
      // Hull 7: g1 +1, g2 0, g3 0, g6 +1, g8 +1 = 3/5 = 0,6. Neste: hull 2, 4, 14 med 0,4.
      nemesisHole: { hole: 7, played: 5, averageToPar: 0.6, worstStrokes: 4 },
      // Aud: 6 møter. g1 tap, g2 seier, g3 seier, g5 tap, g6 tap, g8 tap.
      rival: { name: 'Aud A.', met: 6, decided: 6, wins: 2, losses: 4, ties: 0 },
      // 75+71+72=218, 71+72+77=220, 72+77+77=226. g1–g3, 218/3 = 72,7 → 73.
      formPeak: { averageBrutto: 73, from: 'g1', to: 'g3', start: 75, now: 77, best: 71 },
    },
    team: { rounds: 1, bestBrutto: 68, bestWith: ['Dag D.'], mostRoundsWith: ['Dag D.'] },
    gang: {
      members: 5, // Aud, Bjørn, Cecilie, Dag, Maximiliansebastians
      games: 6,
      winner: { names: ['Bjørn B.', 'Aud A.'], count: 2 },
      // I Bjørns runder med egen ball (g1, g2, g3, g6, g8): Aud 2, Bjørn 2, Cecilie 2
      // (g1, g8), Max. 2 (g1, g2), Dag 1. Bjørn først, så Aud (6 runder), så
      // Cecilie og Max. (3 hver) etter navn. Kortet: tre navn og «og 1 til».
      birdies: { names: ['Bjørn B.', 'Aud A.', 'Cecilie C.', 'Maximiliansebastians G.'], count: 2 },
      // Bjørn g8, Cecilie g1, Dag g8. Cecilie og Dag har 3 runder hver: navnet avgjør.
      snowmen: { names: ['Bjørn B.', 'Cecilie C.', 'Dag D.'], count: 1 },
      tightest: {
        game: 'Oktoberrunden',
        margin: 1,
        leader: ['Maximiliansebastians G.', 73],
        runnerUp: ['Cecilie C.', 74],
      },
    },
  },
  // Eli: bare g7 (9 hull). Under terskelen, og ingen komplett runde gir oppgjør.
  E: {
    rounds: 1,
    soloRounds: 1,
    teamRounds: 0,
    personal: null,
    team: null,
    gang: {
      members: 3, // Aud, Dag, Eli
      games: 1,
      winner: { names: ['Eli E.'], count: 1 },
      birdies: { names: ['Eli E.'], count: 2 },
      snowmen: { names: ['Eli E.'], count: 1 },
      tightest: null,
    },
  },
  // Finn: ingen runder i 2026 (bare g10 i 2025).
  F: {
    rounds: 0,
    soloRounds: 0,
    teamRounds: 0,
    personal: null,
    team: null,
    gang: null,
  },
};
