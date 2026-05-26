// Felles types for mode-router (lib/scoring/index.ts) og mode-modules
// (lib/scoring/modes/*). Discriminated union på `kind` matcher
// games.game_mode-discriminator i DB.

export type GameMode =
  | 'best_ball_netto'
  | 'stableford'
  | 'singles_matchplay'
  | 'solo_strokeplay_netto'
  | 'texas_scramble'
  | 'fourball_matchplay';

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
  texas_scramble: 'Texas scramble',
  fourball_matchplay: 'Fourball',
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
 *
 * Texas scramble (issue #44):
 *  - `team_size: 2 | 4` = antall spillere per lag (3-mannslag ikke i v1)
 *  - `teams_count` = antall lag i spillet (fri, 1+)
 *  - `team_handicap_pct` = prosent av summert lag-HCP som blir effektivt
 *    lag-handicap (NGF-konvensjon: 25 for 2-mannslag, 10 for 4-mannslag).
 *    0-100 — admin kan justere som i best ball. 0 = gross, 100 = full sum.
 *  - Texas lagrer ÉN score per lag per hull (ikke per spiller). I scoring-
 *    laget representeres dette ved at lag-kapteinen (først-i-rekkefølge per
 *    lag) eier scores-radene; andre lag-medlemmer har null på sine egne rader.
 */
export type GameModeConfig =
  | { kind: 'best_ball_netto'; team_size: 2; teams_count: 4 }
  | { kind: 'stableford'; team_size: 1; points_table: 'standard' }
  | { kind: 'stableford'; team_size: 2; points_table: 'standard' }
  | { kind: 'singles_matchplay'; team_size: 1; teams_count: 2 }
  | { kind: 'solo_strokeplay_netto'; team_size: 1 }
  | {
      kind: 'texas_scramble';
      team_size: 2 | 4;
      teams_count: number;
      team_handicap_pct: number;
    }
  | {
      kind: 'fourball_matchplay';
      team_size: 2;
      teams_count: 2;
      /**
       * HCP-allowance for fourball matchplay (0..100). WHS-default = 85 %.
       * `compute()` leser feltet og kaller `applyAllowance(courseHandicap, pct)`
       * per spiller før SI-allokering. 0 = brutto (gross-only matchplay),
       * 100 = full handicap. Validatoren i `lib/games/gamePayload.ts` håndhever
       * range; scoring-laget faller defensivt tilbake til 100 hvis feltet
       * mangler i draft-state.
       */
      allowance_pct: number;
    };

/**
 * Tee-gender på spiller-nivå. Matcher `game_players.tee_gender`-enum-en
 * (mens/ladies/juniors) som velger hvilken par-variant en spiller spiller
 * fra på et hull med per-kjønn-overstyring. #240.
 */
export type ScoringGender = 'mens' | 'ladies' | 'juniors';

/**
 * Minimal hole-shape som scoring-laget trenger. Holder oss løse fra
 * Supabase `course_holes`-raden — kallsteder mapper sin egen form ned.
 */
export interface ScoringHole {
  number: number;
  /**
   * Felles par-verdi. Brukes som fallback når `parByGender` ikke er satt
   * (eksisterende tester og test-fixtures som ikke trenger per-kjønn-par).
   * Når `parByGender` er satt, leser scoring-laget par per spiller via
   * `parFor(hole, player.teeGender)`. #240.
   */
  par: number;
  /**
   * Valgfri per-kjønn-overstyring fra `course_holes.par_mens/_ladies/_juniors`.
   * Når NULL/undefined: alle kjønn bruker `par`. Når satt: scoring-laget
   * velger riktig variant per spiller (eller per lag-kaptein for Texas
   * scramble der laget spiller felles ball). #240.
   */
  parByGender?: { mens: number; ladies: number; juniors: number };
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
  /**
   * Spillerens tee-gender (fra `game_players.tee_gender`). Brukes til å
   * velge riktig par fra `hole.parByGender`. Default `'mens'` når feltet
   * ikke er satt — bevarer eksisterende test-oppførsel og brukes også som
   * fallback når hole bare har felles `par`. #240.
   */
  teeGender?: ScoringGender;
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
  /**
   * Spillerens par for hullet (`parFor(hole, player.teeGender)`).
   * Per-spiller-par eksponeres slik at UI kan vise individuell par-referanse
   * når blandet-kjønn-lag spiller på hull med per-kjønn-overstyring. #240.
   */
  par: number;
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
  /**
   * Bevart for backward-compat. Sett lik `side1Par` slik at konsumenter som
   * tidligere leste én felles par-verdi fortsatt fungerer. UI-laget bør bruke
   * `side1Par`/`side2Par` direkte når blandet-kjønn-match skal vises korrekt.
   */
  par: number;
  /**
   * Per-side par fra `parFor(hole, side.teeGender)`. Når begge sider har
   * samme teeGender (eller hullet ikke har parByGender) er `side1Par === side2Par`.
   * #240.
   */
  side1Par: number;
  side2Par: number;
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
  /**
   * Sidens tee-gender (fra `game_players.tee_gender`). Brukes til å velge
   * riktig par via `parFor(hole, side.teeGender)` på hull med per-kjønn-
   * overstyring. Default `'mens'` når undefined (samme fallback som
   * `ScoringPlayer.teeGender`). #240.
   */
  teeGender?: ScoringGender;
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

// -----------------------------------------------------------------------------
// Texas scramble (issue #44).
//
// Lagene velger beste slag etter hver runde og slår derfra — én ball per lag,
// én score per lag per hull. Lag-handicap = round(combinedCourseHandicap ×
// team_handicap_pct / 100) (NGF-konvensjon: default 25 % for 2-mannslag,
// 10 % for 4-mannslag). Allokeres per hull via vanlig SI-allokering, så
// hardeste hull får extra strokes først.
//
// Lagring: én utvalgt «kaptein» (lexicographically minste userId) per lag
// eier scores-radene. Andre lag-medlemmer kan taste; tap fra hvem som helst
// skriver til kaptein-raden (entered_by = den som tastet). Resultatet er ett
// shared scorekort per lag, lagret uten ny tabell.
//
// Ranking: lavest totalNet vinner, med 5-tier tie-break-cascade fra
// `rankTeams` på per-hull team_net-arrays. Samme padding-strategi som
// bestBallNetto for missing-hull (0-padding i ranking-array).
// -----------------------------------------------------------------------------

/**
 * Per-medlem-detalj på et Texas-lag. `isCaptain` flagger lexicographically
 * minste userId — den som faktisk eier scores-radene i DB. UI bruker dette
 * primært for debugging/admin-innsikt; spillere ser bare lag-kortet, ikke
 * hvem som er kaptein.
 */
export interface TexasScramblePlayerCell {
  userId: string;
  /**
   * Brukerens individuelle CH. Inngår i `combinedCourseHandicap`-summen
   * og vises i UI som dokumentasjon på hvordan lag-HCP ble beregnet.
   */
  courseHandicap: number;
  isCaptain: boolean;
}

export interface TexasScrambleHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** Lag-gross = scoren slått som ett lag på dette hullet. */
  teamGross: number | null;
  /** Lag-extra-strokes på dette hullet (fra lag-HCP-allokering via SI). */
  teamExtraStrokes: number;
  /** Lag-netto = teamGross − teamExtraStrokes. Null hvis teamGross null. */
  teamNet: number | null;
}

/**
 * Lag-rad i Texas-scramble-resultatet. `totalNet`/`totalGross` summerer kun
 * spilte hull (teamGross !== null); `missingHoles` lister hullene som mangler.
 * Konsumenter som sammenligner lag-totaler MÅ sjekke at `missingHoles` er
 * tomt for begge lag, ellers er sammenligningen meningsløs.
 */
export interface TexasScrambleTeamLine {
  teamNumber: number;
  /** Alle medlemmer (inkl. kaptein), sortert deterministisk for stabil UI-rendering. */
  members: TexasScramblePlayerCell[];
  /** Sum av medlemmers courseHandicap (før prosent-reduksjon). */
  combinedCourseHandicap: number;
  /** Effektiv lag-HCP = round(combinedCH × team_handicap_pct / 100). */
  teamHandicap: number;
  holes: TexasScrambleHoleRow[];
  totalNet: number;
  totalGross: number;
  missingHoles: number[];
  rank: number;
  tiedWith: number[];
}

export interface TexasScrambleResult {
  kind: 'texas_scramble';
  teams: TexasScrambleTeamLine[];
}

// -----------------------------------------------------------------------------
// Four-ball matchplay (issue #217, fase 2 av #47).
//
// 2v2 matchplay der hver spiller har egen ball, lagets score per hull = beste
// av to spilleres netto-score, sammenlikn lag1.best vs lag2.best som matchplay.
// Gjenbruker:
//  - `bestBallForHole(players)` for «best av to per hull»-aggregering
//  - `classifyMatchplayHole(side1Net, side2Net)` for per-hull-utfall (mater den
//    med lag-best-netto i stedet for individuell-netto)
//  - `computeMatchResult(holesUp, holesPlayed, holesRemaining)` for match-status
//    + format-strengen («3&2», «AS», «2up») — identisk semantikk med singles
//
// Allowance-pipeline: `compute()` leser `mode_config` for å hente cup-bredt
// allowance, kaller `applyAllowance(player.courseHandicap, pct)` per spiller før
// SI-allokering. 0% = brutto (gross-only matchplay).
//
// Re-bruker `MatchplayHoleResult` og `MatchplayMatchResult` fra singles-modusen
// — match-resultat-format-en er identisk.
// -----------------------------------------------------------------------------

/**
 * Per-spiller-detalj på et fourball-hull. `isContributor` flagger spillere som
 * hadde lag-best netto-score på hullet (kan være begge ved tie — speiler
 * `BestBallPlayerCell`-mønsteret).
 */
export interface FourballPlayerCell {
  userId: string;
  gross: number | null;
  /** Extra strokes for hullet fra SI-allokering (etter allowance). */
  extraStrokes: number;
  /** Netto = gross − extra. Null hvis gross er null. */
  net: number | null;
  isContributor: boolean;
  /**
   * Spillerens par for hullet (`parFor(hole, player.teeGender)`). Eksponeres
   * slik at blandet-kjønn-par på hull med per-kjønn-overstyring kan vises
   * korrekt. #240.
   */
  par: number;
}

/**
 * Per-hull-rad i en four-ball matchplay-match. Inneholder begge siders 2
 * spillere med per-spiller-detalj, lag-best-netto per side, og hvem som vant
 * hullet. `unplayed` = ingen partner på minst én side har gross.
 */
export interface FourballHoleRow {
  holeNumber: number;
  /**
   * Bevart for backward-compat. Sett lik `side1Par` slik at konsumenter som
   * tidligere leste én felles par-verdi fortsatt fungerer. UI-laget bør bruke
   * `side1Par`/`side2Par` direkte ved blandet-kjønn-par.
   */
  par: number;
  /**
   * Per-side par fra `parFor(hole, side.teeGender)`. Når begge sider har
   * samme teeGender (eller hullet ikke har parByGender) er `side1Par === side2Par`.
   * #240. For fourball bruker vi første medlem på hver side som side-representant.
   */
  side1Par: number;
  side2Par: number;
  strokeIndex: number;
  /** Per-spiller-detalj for side 1 (alltid 2 spillere). */
  side1Players: FourballPlayerCell[];
  /** Per-spiller-detalj for side 2 (alltid 2 spillere). */
  side2Players: FourballPlayerCell[];
  /**
   * Lag-best netto per side. Null hvis ingen av partnerne har gross på hullet.
   * Best-ball-tradisjon: én partner med gross er nok — lag-best er den ene
   * spillerens netto, hullet teller som spilt for siden. Hullet er kun
   * `unplayed` når begge sider mangler best.
   */
  side1BestNet: number | null;
  side2BestNet: number | null;
  /** UserIds som hadde lag-best netto. Tom-array når siden er unplayed. */
  side1ContributorIds: string[];
  side2ContributorIds: string[];
  /** Hvem vant hullet via `classifyMatchplayHole(side1BestNet, side2BestNet)`. */
  result: MatchplayHoleResult;
}

/**
 * Én av de to sidene i en four-ball matchplay-match. `sideNumber` 1 eller 2
 * matcher `game_players.team_number`. Inneholder alltid 2 spillere.
 */
export interface FourballSide {
  /** 1 eller 2 — matcher game_players.team_number for fourball-spillere. */
  sideNumber: 1 | 2;
  /** Begge partnere, sortert deterministisk på userId for stabil UI. */
  players: [FourballSidePlayer, FourballSidePlayer];
}

/**
 * Spiller-detalj på en fourball-side. `effectiveHandicap` reflekterer
 * `applyAllowance(courseHandicap, mode_config.allowance_pct)` — det er denne
 * verdien som brukes til SI-allokering.
 */
export interface FourballSidePlayer {
  userId: string;
  /** Raw CH før allowance, bevart for transparens. */
  courseHandicap: number;
  /** Etter `applyAllowance(courseHandicap, allowance_pct)`. */
  effectiveHandicap: number;
  /**
   * Sidens spillers tee-gender (fra `game_players.tee_gender`). Brukes til
   * `parFor(hole, teeGender)` på hull med per-kjønn-overstyring. Default
   * `'mens'` når undefined. #240.
   */
  teeGender?: ScoringGender;
}

/**
 * Resultat fra `fourballMatchplay.compute()`. Speiler `SinglesMatchplayResult`
 * tett — eneste forskjell er 2 spillere per side og per-hull lag-best i tillegg
 * til per-spiller-detalj. `result`-feltet og match-format-strenger («3&2»,
 * «AS», «2up») er identisk med singles.
 */
export interface FourballMatchplayResult {
  kind: 'fourball_matchplay';
  /** Tuple: alltid to sider, sortert side 1 så side 2. */
  sides: [FourballSide, FourballSide];
  holes: FourballHoleRow[];
  /** side1-hull-vinst − side2-hull-vinst. Positiv = side 1 up. */
  holesUp: number;
  /** Antall hull der begge sider har lag-best (= avgjorte hull, inklusiv tied). */
  holesPlayed: number;
  /** `max(0, 18 − holesPlayed)`. */
  holesRemaining: number;
  /**
   * `null` = matchen er ikke avgjort ennå.
   * Et `MatchplayMatchResult`-objekt = mat-em eller spilt 18 hull. Format-
   * strengene («3&2», «AS», «2up») er identisk med singles via gjenbruk av
   * `computeMatchResult`.
   */
  result: MatchplayMatchResult | null;
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
 *
 * For texas_scramble narrower man på `kind` og leser `teams` direkte —
 * kun team-variant i v1 (3-mannslag utsatt).
 */
export type ModeResult =
  | BestBallNettoResult
  | StablefordResult
  | SinglesMatchplayResult
  | SoloStrokeplayResult
  | TexasScrambleResult
  | FourballMatchplayResult;
