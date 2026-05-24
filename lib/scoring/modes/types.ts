// Felles types for mode-router (lib/scoring/index.ts) og mode-modules
// (lib/scoring/modes/*). Discriminated union på `kind` matcher
// games.game_mode-discriminator i DB.

export type GameMode =
  | 'best_ball_netto'
  | 'stableford'
  | 'singles_matchplay'
  | 'solo_strokeplay_netto';

/**
 * Norske visnings-labels for hver spillmodus. Brukes av ModeChip i admin-
 * surfaces og av detail-pages som viser «Spillform: …». Holdt som single
 * source of truth slik at vi ikke driver ulike norske oversettelser per
 * call-site. Speilet `STATUS_LABELS` i `lib/games/status.ts`.
 */
export const MODE_LABELS: Record<GameMode, string> = {
  best_ball_netto: 'Best ball',
  stableford: 'Stableford',
  singles_matchplay: 'Matchplay',
  solo_strokeplay_netto: 'Slagspill',
};

/**
 * Mode-spesifikk config som lagres i `games.mode_config` (JSONB).
 * Diskrimineres på `kind` slik at konsumenter narrower trygt.
 *
 * Stableford-grenen har to varianter:
 *  - `team_size: 1` = solo (en spiller = en deltager, ranking på spiller-poeng)
 *  - `team_size: 2` = par-stableford / 4BBB (to spillere per lag, lag-hull-poeng
 *    = MAX av partnernes individuelle poeng, ranking på lag-poeng)
 *
 * Singles matchplay (epic #45):
 *  - `team_size: 1` = én spiller per side (ingen aggregering)
 *  - `teams_count: 2` = nøyaktig to sider, alltid 1v1
 *
 * Solo strokeplay netto (epic #46):
 *  - `team_size: 1` = solo, hver spiller er sin egen «row»
 *  - Klassisk slagspill: lavest sum av netto-slag (gross − HCP-strokes) vinner
 */
export type GameModeConfig =
  | { kind: 'best_ball_netto'; team_size: 2; teams_count: 4 }
  | { kind: 'stableford'; team_size: 1; points_table: 'standard' }
  | { kind: 'stableford'; team_size: 2; points_table: 'standard' }
  | { kind: 'singles_matchplay'; team_size: 1; teams_count: 2 }
  | { kind: 'solo_strokeplay_netto'; team_size: 1 };

/**
 * Minimal hole-shape som scoring-laget trenger. Holder oss løse fra
 * Supabase `course_holes`-raden — kallsteder mapper sin egen form ned.
 */
export interface ScoringHole {
  number: number;
  par: number;
  /**
   * Stroke index 1..18. Brukes av allocateStrokes/strokesForHole for
   * å bestemme hvilke hull spilleren får slag på.
   */
  strokeIndex: number;
}

export interface ScoringPlayer {
  userId: string;
  /** Null for solo-spill (stableford). */
  teamNumber: number | null;
  /** Null for solo-spill (stableford). */
  flightNumber: number | null;
  courseHandicap: number;
}

export interface ScoringHoleScore {
  userId: string;
  holeNumber: number;
  gross: number | null;
}

export interface ScoringContext {
  game: {
    id: string;
    game_mode: GameMode;
    mode_config: GameModeConfig;
  };
  players: ScoringPlayer[];
  holes: ScoringHole[];
  scores: ScoringHoleScore[];
}

/**
 * Per-spiller-rad i best-ball-resultat. Speilar shape som dagens
 * `bestBall.ts`-eksporter bruker (gross, extraStrokes, net) slik at vi
 * ikke brekker konsumenter ved migrering til mode-router.
 */
export interface BestBallPlayerCell {
  userId: string;
  gross: number | null;
  extraStrokes: number;
  net: number | null;
  isContributor: boolean;
}

export interface BestBallHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  teamNet: number | null;
  contributorIds: string[];
  players: BestBallPlayerCell[];
}

export interface BestBallTeamLine {
  teamNumber: number;
  playerIds: string[];
  holes: BestBallHoleRow[];
  total: number;
  missingHoles: number[];
  rank: number;
  tiedWith: number[];
}

export interface BestBallNettoResult {
  kind: 'best_ball_netto';
  teams: BestBallTeamLine[];
}

export interface StablefordPlayerLine {
  userId: string;
  totalPoints: number;
  rank: number;
  holesPlayed: number;
  /**
   * Tied-with: andre spilleres userIds som har EKSAKT samme tie-break-cascade
   * (totalPoints + back9 + back6 + back3 + hole18-poeng). Tom for unike rader.
   */
  tiedWith: string[];
}

/**
 * Solo-variant av stableford-resultatet — én rad per spiller.
 * Returnert når `mode_config.team_size === 1`.
 */
export interface StablefordSoloResult {
  kind: 'stableford';
  variant: 'solo';
  players: StablefordPlayerLine[];
}

/**
 * Per-spiller per-hull-detalj i par-stableford (4BBB). Speilet best-balls
 * `BestBallPlayerCell` slik at view-laget kan rendre player-rader på
 * konsistent måte. `isContributor` flagger spillere som hadde MAX-poeng
 * på hullet (kan være begge ved tie).
 */
export interface StablefordPlayerCell {
  userId: string;
  gross: number | null;
  /**
   * Netto strokes for hullet (gross minus extra strokes). Null hvis gross
   * er null (hullet ikke spilt). Speiler `BestBallPlayerCell.net`.
   */
  netStrokes: number | null;
  points: number;
  isContributor: boolean;
}

/**
 * Per-hull-rad for et par-stableford-lag. `teamPoints` = MAX av partnernes
 * individuelle stableford-poeng (4BBB-regelen). `contributorIds` = de
 * spillerne som hadde MAX-poeng — kan være begge ved tie.
 */
export interface StablefordTeamHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  teamPoints: number;
  contributorIds: string[];
  players: StablefordPlayerCell[];
}

/**
 * Lag-rad i par-stableford. `totalPoints` = sum av per-hull `teamPoints`.
 * Ranking: høyest poeng vinner med 5-tier tie-break-cascade på lag-poeng-
 * arrays. Speilet `BestBallTeamLine` for konsistent UI-shape.
 */
export interface StablefordTeamLine {
  teamNumber: number;
  playerIds: string[];
  holes: StablefordTeamHoleRow[];
  totalPoints: number;
  rank: number;
  tiedWith: number[];
}

/**
 * Team-variant av stableford-resultatet — én rad per lag (par).
 * Returnert når `mode_config.team_size === 2`.
 */
export interface StablefordTeamResult {
  kind: 'stableford';
  variant: 'team';
  teams: StablefordTeamLine[];
}

/**
 * Discriminert på `variant`: konsumenter narrower trygt på solo vs team.
 * Bevart `kind: 'stableford'` så ytre router-narrowing (på `ModeResult.kind`)
 * fortsatt fungerer for begge variantene.
 */
export type StablefordResult = StablefordSoloResult | StablefordTeamResult;

// -----------------------------------------------------------------------------
// Singles matchplay (epic #45).
//
// Matchplay er fundamentalt ulikt poeng-baserte modi: ingen totaler, men
// hull-for-hull W/L/T. Per hull sammenlignes side 1 sin netto-score mot side
// 2 sin netto-score; laveste netto vinner hullet, lik netto = tied. Match-
// status = (antall hull side 1 vant) − (antall hull side 2 vant). Matchen er
// mat-em (avgjort før 18 hull) når |holesUp| > holesRemaining.
// -----------------------------------------------------------------------------

export type MatchplayHoleResult = 'side1_wins' | 'side2_wins' | 'tied' | 'unplayed';

/**
 * Per-hull-rad i en singles matchplay-match. Inneholder begge siders gross,
 * extra strokes og netto, samt hvem som vant hullet. `unplayed` brukes når
 * minst én side mangler gross — matchplay krever begge sider for å avgjøre
 * et hull, og uplayed-hull bidrar ikke til match-status.
 */
export interface MatchplayHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** Per-side gross. null = ikke spilt. */
  side1Gross: number | null;
  side2Gross: number | null;
  /** Per-side netto (gross − extra). null = ikke spilt. */
  side1Net: number | null;
  side2Net: number | null;
  /** Extra strokes per side på dette hullet. */
  side1Extra: number;
  side2Extra: number;
  /** Hvem vant hullet. 'unplayed' når én eller begge sider mangler gross. */
  result: MatchplayHoleResult;
}

/**
 * Én av de to sidene i en matchplay-match. `sideNumber` 1 eller 2 matcher
 * `game_players.team_number` for matchplay-spillere (validatoren i
 * gamePayload.ts håndhever denne tilordningen).
 */
export interface MatchplaySide {
  /** 1 eller 2 — matcher game_players.team_number for matchplay-spillere. */
  sideNumber: 1 | 2;
  userId: string;
  courseHandicap: number;
}

/**
 * Resultat-meta for en avgjort match. Returneres som `null` på
 * `SinglesMatchplayResult.result` mens matchen fortsatt er live.
 */
export interface MatchplayMatchResult {
  /** Hvilken side vant. 'tied' = AS etter 18 hull. */
  winner: 'side1' | 'side2' | 'tied';
  /**
   * Holes-up i absoluttverdi ved avgjørelse. 0 for tied.
   */
  marginUp: number;
  /**
   * Hull-nummer der matchen ble mat-em (1..18). 18 for spilt ferdig
   * (X up eller AS).
   */
  decidedAtHole: number;
  /** Holes remaining ved avgjørelse. 0 hvis spilt ferdig. */
  remainingAtDecision: number;
  /**
   * Formatert resultat-streng (golf-standard):
   *  - `'AS'` når tied etter 18
   *  - `'{marginUp}up'` når avgjort etter 18 hull
   *  - `'{marginUp}&{remainingAtDecision}'` når mat-em før 18
   */
  formatted: string;
}

/**
 * Resultat fra `singlesMatchplay.compute()`. Inneholder per-hull-rader,
 * løpende match-status (`holesUp`/`holesPlayed`/`holesRemaining`) og et
 * `result`-objekt som er `null` mens matchen er live og fylles inn når
 * matchen er avgjort (mat-em eller spilt 18 hull).
 */
export interface SinglesMatchplayResult {
  kind: 'singles_matchplay';
  /** Tuple: alltid to sider, sortert side 1 så side 2. */
  sides: [MatchplaySide, MatchplaySide];
  holes: MatchplayHoleRow[];
  /**
   * Antall hull side 1 vant minus antall hull side 2 vant. Bruker spilte hull,
   * ikke uplayed. Positiv = side 1 up, negativ = side 2 up, 0 = AS.
   */
  holesUp: number;
  /** Antall hull der begge sider har gross (= avgjorte hull, inklusiv tied). */
  holesPlayed: number;
  /**
   * Antall hull igjen som kan bidra til match-utfallet. Beregnes som
   * `18 − holesPlayed` slik at "kan matchen fortsatt avgjøres"-spørsmålet
   * baserer seg på FAKTISK spilte hull (begge sider har gross), ikke
   * påbegynte hull.
   */
  holesRemaining: number;
  /**
   * `null` = matchen er ikke avgjort ennå (live, eller AS midt i runden).
   * Et `MatchplayMatchResult`-objekt = matchen er enten mat-em
   * (`decidedAtHole < 18`) eller ferdig spilt 18 hull.
   */
  result: MatchplayMatchResult | null;
}

// -----------------------------------------------------------------------------
// Solo strokeplay netto (epic #46).
//
// Klassisk slagspill: hver spiller fører eget scorekort, total = sum av netto-
// slag (gross − extra strokes fra HCP-fordelingen). Lavest total vinner. Hull
// uten gross («ikke spilt», pick-up) bidrar IKKE til totalen — vi teller dem
// som ikke spilte, ikke som «0 slag».
//
// Ranking bruker 5-tier tie-break-cascade på per-hull netto-arrays (samme
// `rankTeams`-helper som best-ball, ingen invertering siden lavest skal vinne
// per default). For å unngå at en spiller som har spilt færre hull får et
// urettmessig fortrinn i tie-break-cascaden, padder vi unplayed-hull med et
// stort tall (999) — pragmatisk forenkling for v1, se JSDoc i engine-modulen.
// -----------------------------------------------------------------------------

/**
 * Per-spiller-rad i solo strokeplay netto-resultatet.
 *
 * `totalNetStrokes` og `totalGrossStrokes` summerer kun spilte hull (gross
 * !== null). En spiller som ikke har slått ennå har `totalNetStrokes: 0` og
 * `holesPlayed: 0` — UI-laget viser typisk em-dash i den situasjonen
 * istedenfor «0» for å gjøre forskjellen på «spilte 0 hull» og «spilte 18
 * hull og fikk 0 over par» tydelig.
 */
export interface SoloStrokeplayPlayerLine {
  userId: string;
  /** Sum av netto-slag for spilte hull. */
  totalNetStrokes: number;
  /** Sum av gross-slag for spilte hull (vises på leaderboard ved siden av netto). */
  totalGrossStrokes: number;
  /** Antall hull spilt (gross !== null). */
  holesPlayed: number;
  rank: number;
  /**
   * Tied-with: andre spilleres userIds som har EKSAKT samme tie-break-cascade
   * (totalNet + back9 + back6 + back3 + hole18-netto). Tom for unike rader.
   */
  tiedWith: string[];
}

/**
 * Solo strokeplay netto-resultat — én rad per spiller. Returnert når
 * `game_mode === 'solo_strokeplay_netto'`. Ingen variant-discriminator;
 * solo er den eneste varianten i v1.
 */
export interface SoloStrokeplayResult {
  kind: 'solo_strokeplay_netto';
  players: SoloStrokeplayPlayerLine[];
}

/**
 * Discriminated union — konsumenter narrower på `kind`:
 *   const r = computeLeaderboard(ctx);
 *   if (r.kind === 'stableford') { r.players.forEach(...) }
 *
 * For stableford må man eventuelt narrowe videre på `r.variant` siden
 * solo og team-varianten har ulik shape (players vs teams).
 *
 * For singles_matchplay narrower man på `kind` og leser `sides`/`holes`/
 * `holesUp`/`result` direkte — ingen videre variant-discriminator.
 *
 * For solo_strokeplay_netto narrower man på `kind` og leser `players`
 * direkte — solo er den eneste varianten i v1.
 */
export type ModeResult =
  | BestBallNettoResult
  | StablefordResult
  | SinglesMatchplayResult
  | SoloStrokeplayResult;
