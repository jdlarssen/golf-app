// Felles types for mode-router (lib/scoring/index.ts) og mode-modules
// (lib/scoring/modes/*). Discriminated union på `kind` matcher
// games.game_mode-discriminator i DB.

export type GameMode =
  | 'best_ball'
  | 'stableford'
  | 'modified_stableford'
  | 'singles_matchplay'
  | 'solo_strokeplay'
  | 'texas_scramble'
  | 'ambrose'
  | 'florida_scramble'
  | 'fourball_matchplay'
  | 'foursomes_matchplay'
  | 'greensome_matchplay'
  | 'chapman_matchplay'
  | 'wolf'
  | 'nassau'
  | 'skins'
  | 'bingo_bango_bongo'
  | 'nines'
  | 'round_robin'
  | 'acey_deucey'
  | 'shamble'
  | 'patsome'
  | 'gruesome_matchplay';

/**
 * Norske visnings-labels for hver spillmodus. Brukes av ModeChip i admin-
 * surfaces og av detail-pages som viser «Spillform: …». Holdt som single
 * source of truth slik at vi ikke driver ulike norske oversettelser per
 * call-site. Speilet `STATUS_LABELS` i `lib/games/status.ts`.
 */
export const MODE_LABELS: Record<GameMode, string> = {
  best_ball: 'Best ball',
  stableford: 'Stableford',
  modified_stableford: 'Modifisert Stableford',
  singles_matchplay: 'Matchplay',
  solo_strokeplay: 'Slagspill',
  texas_scramble: 'Texas scramble',
  ambrose: 'Ambrose',
  florida_scramble: 'Florida Scramble',
  fourball_matchplay: 'Fourball',
  foursomes_matchplay: 'Foursomes',
  greensome_matchplay: 'Greensome',
  chapman_matchplay: 'Chapman',
  wolf: 'Wolf',
  nassau: 'Nassau',
  skins: 'Skins',
  bingo_bango_bongo: 'Bingo Bango Bongo',
  nines: 'Nines / Split Sixes',
  round_robin: 'Round Robin',
  acey_deucey: 'Acey Deucey',
  shamble: 'Shamble / Champagne Scramble',
  patsome: 'Patsome',
  gruesome_matchplay: 'Gruesome',
};

/**
 * True for stableford-familien (standard + modified). Begge deler all UI-,
 * wizard-, scorekort- og leaderboard-oppførsel — eneste forskjellen er poeng-
 * tabellen. Brukes på `game_mode`-baserte routing-/display-sjekker som ellers
 * bare så `=== 'stableford'`. For `mode_config.kind`-narrows (der TS må narrowe
 * til varianter med `team_size`) brukes en inline `kind === 'stableford' ||
 * kind === 'modified_stableford'`-sjekk i stedet (#281).
 */
export function isStablefordFamily(mode: GameMode): boolean {
  return mode === 'stableford' || mode === 'modified_stableford';
}

/**
 * True for scramble-familien (Texas scramble + Ambrose + Florida Scramble).
 * Alle deler struktur: én ball per lag, lag-kaptein (lex-min userId) eier
 * scores-radene, lag-grid i wizard/game-home, samme leaderboard-/podium-/
 * mail-visning (alle returnerer `kind: 'texas_scramble'` fra scoring-laget).
 * Eneste forskjeller er lagstørrelse, default-lag-handicap og format-navn.
 * Brukes på `game_mode`-baserte routing-/display-sjekker. Speiler
 * `isStablefordFamily`. #284 (Ambrose), #283 (Florida Scramble).
 *
 * NB: hold mode-spesifikke greiner der default-pct eller copy avviker (Texas
 * 4-mann 10 %, Ambrose 12,5 %, Florida 3-mann 15 %/4-mann 10 %; ulik
 * format-label/helper-tekst; Florida har step-aside-påminnelse).
 */
export function isScrambleFamily(mode: GameMode): boolean {
  return mode === 'texas_scramble' || mode === 'ambrose' || mode === 'florida_scramble';
}

/**
 * True for alternate-shot matchplay-familien (foursomes + greensome + chapman).
 * Alle tre er 2v2 med én ball per lag, kaptein eier scores-radene, Layout B
 * head-to-head-scorekort, cup-snapshot, foursomes-view/podium (alle returnerer
 * `kind: 'foursomes_matchplay'` fra scoring-laget). Forskjellene er lag-handicap-
 * formelen (foursomes = sum/50; greensome + chapman = 60/40/100) og on-course-
 * mekanikken (greensome velger beste utslag; chapman bytter ball, så velger).
 * Brukes på `game_mode`-baserte routing-/display-sjekker. #289, #290.
 *
 * NB: hold mode-spesifikke greiner der oppførsel avviker:
 *  - tee-starter-banner er foursomes-eksklusiv — bruk eksakt
 *    `game_mode === 'foursomes_matchplay'`-sjekk for banner-gating (greensome
 *    og chapman har begge utslag hvert hull, ingen fast rotasjon)
 *  - chapman har en egen phase-stripe (bytt → velg → annenhver)
 */
export function isAlternateShotMatchplay(mode: GameMode): boolean {
  return (
    mode === 'foursomes_matchplay' ||
    mode === 'greensome_matchplay' ||
    mode === 'chapman_matchplay' ||
    mode === 'gruesome_matchplay'
  );
}

/**
 * True for individuelle formater uten lag-/flight-gruppering — spilleren er en
 * flat deltaker, ikke del av et lag eller en side. Single source of truth for
 * når UI skal skjule «Lag»/«Flight»-rader, vise hele deltaker-lista i stedet
 * for en flight-roster, og droppe lag-grid/lag-kolonner.
 *
 * Dekker pott-/individuell-formatene (solo slagspill, Wolf, Nassau, Skins,
 * Bingo Bango Bongo, Nines, Round Robin, Acey Deucey) pluss stableford-familien
 * på `team_size === 1`. Wolf/Round Robin har `team_number` som rotasjons-slot
 * (ikke et lag), så de regnes også som solo her.
 *
 * IKKE solo: best ball, scramble-familien, shamble, patsome (delt lag-ball),
 * matchplay-familien (sider/flight, 1v1 eller 2v2), og par-stableford
 * (`team_size === 2`).
 *
 * Erstatter tidligere `isStablefordFamily`-proxy på display-call-sites som
 * feilaktig viste tomme «Lag —/Flight —»-rader for pott-formatene. Eksplisitt
 * switch med `never`-uttømming: en ny GameMode MÅ klassifiseres her.
 */
export function isSoloFormat(mode: GameMode, teamSize: number): boolean {
  switch (mode) {
    case 'solo_strokeplay':
    case 'wolf':
    case 'nassau':
    case 'skins':
    case 'bingo_bango_bongo':
    case 'nines':
    case 'round_robin':
    case 'acey_deucey':
      return true;
    case 'stableford':
    case 'modified_stableford':
      return teamSize === 1;
    case 'best_ball':
    case 'singles_matchplay':
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble':
    case 'shamble':
    case 'patsome':
      return false;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/**
 * Spillestil for format-kortene (#478) — hvordan deltakerne er organisert,
 * vist som et lite merke i veiviseren og på /spillformer så man ser med en
 * gang hva slags spill formatet er:
 *
 *  - `solo`       — du spiller alene / øver (solo slagspill).
 *  - `individual` — flere spillere konkurrerer hver for seg, ingen lag
 *                   (pott-format som Wolf/Skins/Nassau + 1-mot-1 matchplay).
 *  - `team`       — dere er gruppert på lag eller sider (best ball, scramble-
 *                   familien, foursomes/fourball, shamble, patsome).
 *  - `flexible`   — kan spilles enten solo eller som lag (stableford-familien:
 *                   solo eller 4BBB).
 *
 * Eksplisitt switch med `never`-uttømming: en ny GameMode MÅ klassifiseres her.
 */
export type PlayStyle = 'solo' | 'individual' | 'team' | 'flexible';

export function formatPlayStyle(mode: GameMode): PlayStyle {
  switch (mode) {
    case 'solo_strokeplay':
      return 'solo';
    case 'stableford':
    case 'modified_stableford':
      return 'flexible';
    case 'singles_matchplay':
    case 'wolf':
    case 'nassau':
    case 'skins':
    case 'bingo_bango_bongo':
    case 'nines':
    case 'round_robin':
    case 'acey_deucey':
      return 'individual';
    case 'best_ball':
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble':
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
    case 'shamble':
    case 'patsome':
      return 'team';
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/** Norske merke-labels per spillestil (#478). Single source of truth. */
export const PLAY_STYLE_LABELS: Record<PlayStyle, string> = {
  solo: 'Solo',
  individual: 'Hver for seg',
  team: 'Lag',
  flexible: 'Solo eller lag',
};

/**
 * WD / «trekk spiller» (#386): hvilke format støtter at en spiller trekkes ut
 * av rangeringen (scorene teller ikke). Kun individuell-ball-totalformat der
 * eksklusjon faktisk endrer resultatet: best ball, stableford-familien, solo
 * slagspill.
 *
 * Out-of-scope (faller tilbake på «ikke levert» — scorene teller, som i dag):
 *  - scramble/shamble/patsome: delt lag-kort → WD har ingen scoring-effekt
 *  - matchplay-familien: et frafall er en walkover, egen semantikk
 *  - pott-format (wolf/nassau/skins/nines/bbb/acey-deucey/round-robin):
 *    carryover/hode-mot-hode-oppgjør, egen semantikk
 *
 * Eksplisitt switch med `never`-uttømming: en ny GameMode MÅ klassifiseres her.
 */
export function supportsWithdrawal(mode: GameMode): boolean {
  switch (mode) {
    case 'best_ball':
    case 'stableford':
    case 'modified_stableford':
    case 'solo_strokeplay':
      return true;
    case 'singles_matchplay':
    case 'fourball_matchplay':
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble':
    case 'shamble':
    case 'patsome':
    case 'wolf':
    case 'nassau':
    case 'skins':
    case 'bingo_bango_bongo':
    case 'nines':
    case 'round_robin':
    case 'acey_deucey':
      return false;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

/**
 * Mode-spesifikk config som lagres i `games.mode_config` (JSONB).
 * Diskrimineres på `kind` slik at konsumenter narrower trygt.
 *
 * Stableford-grenen har to varianter:
 *  - `team_size: 1` = solo (en spiller = en deltager, ranking på spiller-poeng)
 *  - `team_size: 2` = par-stableford / 4BBB (to spillere per lag, lag-hull-poeng
 *    = MAX av partnernes individuelle poeng, ranking på lag-poeng)
 *
 * Modified stableford (issue #281) speiler stableford-shapen, men `points_table:
 * 'modified'` velger pro-tabellen (dobbeltbogey+ = −3, bogey = −1, par = 0,
 * birdie = +2, eagle = +5, albatross+ = +8). Samme solo/par-varianter, samme
 * handicap-bruk. Returnerer `kind: 'stableford'` fra scoring-laget slik at
 * leaderboard-/podium-visningen gjenbrukes uendret.
 *
 * Singles matchplay (epic #45):
 *  - `team_size: 1` = én spiller per side (ingen aggregering)
 *  - `teams_count: 2` = nøyaktig to sider, alltid 1v1
 *
 * Solo strokeplay (epic #46):
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
  | { kind: 'best_ball'; team_size: 2; teams_count: number }
  | { kind: 'stableford'; team_size: 1; points_table: 'standard' }
  | { kind: 'stableford'; team_size: 2; points_table: 'standard' }
  | { kind: 'modified_stableford'; team_size: 1; points_table: 'modified' }
  | { kind: 'modified_stableford'; team_size: 2; points_table: 'modified' }
  | { kind: 'singles_matchplay'; team_size: 1; teams_count: 2 }
  | { kind: 'solo_strokeplay'; team_size: 1 }
  | {
      kind: 'texas_scramble';
      team_size: 2 | 4;
      teams_count: number;
      team_handicap_pct: number;
    }
  | {
      /**
       * Ambrose (issue #284) — net scramble, mekanisk identisk med Texas
       * scramble (én ball per lag, kaptein eier scores-radene, lavest lag-netto
       * vinner). Eneste forskjell er default-lag-handicapet: standard Ambrose-
       * formel `combinedCH ÷ (2 × team_size)` (2-mann 25 %, 4-mann 12,5 %) i
       * stedet for Texas' NGF-konvensjon (2-mann 25 %, 4-mann 10 %).
       *
       * `team_handicap_pct` er justerbar (0–100) som i Texas — Ambrose-reglene
       * er en klubb-konvensjon, ikke strengt regelbundet. Kan være fraksjonell
       * (4-mann-default = 12,5). Scoring-laget (`ambrose.ts`) gjenbruker Texas-
       * motoren og returnerer `kind: 'texas_scramble'` slik at all leaderboard-/
       * podium-/mail-visning rendres uendret.
       */
      kind: 'ambrose';
      team_size: 2 | 4;
      teams_count: number;
      team_handicap_pct: number;
    }
  | {
      /**
       * Florida Scramble (issue #283) — Texas-variant med step-aside-regel.
       * Mekanisk identisk med Texas scramble (én ball per lag, kaptein eier
       * scores-radene, lavest lag-netto vinner). Eneste forskjeller:
       *  1. Lagstørrelser: 3 eller 4 (ikke 2 som Texas/Ambrose).
       *  2. Default-lag-handicap: NGF-fasttabell (3-mann 15 %, 4-mann 10 %).
       *  3. Step-aside-regel (honor-system, kun UI-påminnelse, ingen tracking).
       *
       * `team_handicap_pct` er justerbar (0–100) som i Texas/Ambrose.
       * Scoring-laget (`floridaScramble.ts`) gjenbruker Texas-motoren og
       * returnerer `kind: 'texas_scramble'` slik at all leaderboard-/podium-/
       * mail-visning rendres uendret. #283.
       */
      kind: 'florida_scramble';
      team_size: 3 | 4;
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
    }
  | {
      kind: 'foursomes_matchplay';
      team_size: 2;
      teams_count: 2;
      /**
       * HCP-allowance for foursomes matchplay (0..100). WHS-default = 50 %.
       * Diff-basert formel: `highSideExtraHCP = round(|side1CombinedCH -
       * side2CombinedCH| × allowance_pct / 100)`. Lavlaget får 0 strokes;
       * høylaget får `highSideExtraHCP` strokes allokert via SI. 0 = brutto
       * (gross-only matchplay), 100 = full HCP-differanse. Validatoren i
       * `lib/games/gamePayload.ts` håndhever range; scoring-laget faller
       * defensivt tilbake til 100 hvis feltet mangler i draft-state.
       */
      allowance_pct: number;
    }
  | {
      /**
       * Greensome matchplay (issue #289) — 2v2 velg-beste-tee + alternate.
       * Begge slår ut, paret velger beste utslag, spiller alternate derfra.
       * Scoring-laget returnerer `kind: 'foursomes_matchplay'` (gjenbruker
       * FoursomesMatchplayResult + all visning). Config-kind er 'greensome_matchplay'
       * for validator/form-routing.
       *
       * Lag-handicap: 0,6×laveste + 0,4×høyeste (WHS-greensome-blanding).
       * Allowance: WHS-default 100 % (full differanse — ett blandet enkelt-tall
       * per side sammenliknes som individuelle spillere). Justerbar 0..100.
       */
      kind: 'greensome_matchplay';
      team_size: 2;
      teams_count: 2;
      allowance_pct: number;
    }
  | {
      kind: 'chapman_matchplay';
      team_size: 2;
      teams_count: 2;
      /**
       * HCP-allowance for Chapman matchplay (0..100). Default = 100. Identisk
       * lag-handicap-formel som greensome (60/40-blanding på side-nivå:
       * side-HCP = round(0.6×lav + 0.4×høy)) — Chapman og Greensome skiller
       * seg kun i on-course-mekanikk (Chapman bytter ball først). Høylaget får
       * `round(|side1Hcp − side2Hcp| × allowance_pct / 100)` strokes via SI;
       * lavlaget får 0. 0 = brutto, 100 = full differanse. Validatoren
       * håndhever range; scoring-laget faller defensivt tilbake til 100.
       */
      allowance_pct: number;
    }
  | {
      /**
       * Gruesome matchplay (issue #291) — 2v2 motstander-velger-tee + alternate.
       * Begge slår ut, motstanderlaget velger hvilken tee-ball paret MÅ spille
       * (typisk den dårligste), deretter alternate shot som foursomes.
       * Scoring-laget returnerer `kind: 'foursomes_matchplay'` (gjenbruker
       * FoursomesMatchplayResult + all visning). Config-kind er 'gruesome_matchplay'
       * for validator/form-routing.
       *
       * Lag-handicap: sum av begge partneres CH (WHS-standard for foursomes —
       * motstanderens tee-valg endrer IKKE handicapet). Allowance: WHS-default
       * 50 % (identisk med foursomes). Justerbar 0..100.
       */
      kind: 'gruesome_matchplay';
      team_size: 2;
      teams_count: 2;
      allowance_pct: number;
    }
  | {
      kind: 'wolf';
      team_size: 1;
      /** #465: antall spillere (3-5), = antall rotation-slots. */
      teams_count: number;
      /**
       * Brutto vs netto for Wolf. 'net' = hver spillers per-hull-score er
       * gross − strokesForHole(courseHandicap, strokeIndex). 'gross' =
       * ren gross-score (HCP ignoreres).
       *
       * Admin velger ved opprett. Default 'net' speiler Tørny's resten-av-
       * appen-ethos. `games.hcp_allowance_pct` brukes IKKE for Wolf — vi
       * bruker enten full HCP eller ingen.
       */
      wolf_scoring: 'gross' | 'net';
    }
  | {
      kind: 'nassau';
      team_size: 1;
      /**
       * Brutto vs netto for Nassau. 'net' = hver spillers per-hull-score er
       * gross − strokesForHole(courseHandicap, strokeIndex). 'gross' = ren
       * gross-score (HCP ignoreres). Speiler Wolf-mønstret.
       */
      nassau_scoring: 'gross' | 'net';
    }
  | {
      kind: 'skins';
      team_size: 1;
      /**
       * Brutto vs netto for Skins. 'net' = hver spillers per-hull-score er
       * gross − strokesForHole(courseHandicap, strokeIndex). 'gross' = ren
       * gross-score (HCP ignoreres). Speiler Wolf/Nassau-mønstret.
       */
      skins_scoring: 'gross' | 'net';
    }
  | {
      /**
       * Bingo Bango Bongo: individuelt format, 2–16 spillere (#460), ingen lag. Tre
       * prestasjons-poeng per hull (bingo/bango/bongo). Slag registreres via
       * vanlig scorekort, men teller ikke for BBB-poeng. Speiler
       * `solo_strokeplay`-config (team_size: 1, ingen ekstra felt).
       */
      kind: 'bingo_bango_bongo';
      team_size: 1;
    }
  | {
      /**
       * Nines / Split Sixes (issue #278): individuelt 3-spiller-format. Poeng
       * fordeles per hull etter effective-score-rangering. To varianter:
       *  - 'nines': 9 poeng per hull (5–3–1)
       *  - 'split_sixes': 6 poeng per hull (4–2–0)
       * Likt på et hull → poengene for de delte plassene legges sammen og deles
       * likt. Strokeplay-utledet (leser ctx.scores, ingen egen input-tabell).
       * team_size: 1 (ingen lag). Speiler skins-config med en variant-flag i tillegg.
       */
      kind: 'nines';
      team_size: 1;
      nines_variant: 'nines' | 'split_sixes';
      /** 'net' = gross − strokesForHole(CH, SI). 'gross' = rå gross. Speiler skins_scoring. */
      nines_scoring: 'gross' | 'net';
    }
  | {
      /**
       * Round Robin: 4-spiller roterende-partner 4BBB-matchplay (issue #280).
       * Runden deles i tre 6-hulls-segmenter; partner-konstellasjonen roterer
       * deterministisk slik at hver spiller spiller med + mot alle andre én gang.
       * Seg1 (h1–6): [slot1,slot2] vs [slot3,slot4].
       * Seg2 (h7–12): [slot1,slot3] vs [slot2,slot4].
       * Seg3 (h13–18): [slot1,slot4] vs [slot2,slot3].
       *
       * Per hull: beste netto per side (bestBallForHole), sammenlign som matchplay
       * (classifyMatchplayHole). Vinnende side: +1 hull-seire til hver spiller.
       * Delt hull: 0 til alle. Rangering: flest hull-seire vinner.
       *
       * `allowance_pct`: WHS-standard 85 % (matchplay-modell). 0 = brutto.
       * Speiler fourball_matchplay-config-shapen for allowance-feltet.
       */
      kind: 'round_robin';
      team_size: 1;
      teams_count: 4;
      allowance_pct: number;
    }
  | {
      /**
       * Acey Deucey: individuelt format, EKSAKT 4 spillere, ingen lag. Per
       * hull: lavest unique effective score → +3 (ace), høyest unique → −3
       * (deuce), de to midtre → 0. Delt lavest/høyest → den siden deles ikke
       * ut. Hull uten score for alle 4 → 0 til alle, men ingen frys.
       * Brutto/netto-toggle speiler Wolf/Nassau/Skins-mønstret.
       */
      kind: 'acey_deucey';
      team_size: 1;
      acey_deucey_scoring: 'gross' | 'net';
    }
  | {
      /**
       * Shamble / Champagne Scramble (#285): lag-format. Delt drive, så egen
       * ball til hull. Lagets hull-score = sum av de `shamble_count` laveste
       * effective-scorene på hullet. Strokeplay-utledet (egne score-rader, som
       * best ball / nines — ingen captain-rad).
       */
      kind: 'shamble';
      team_size: 3 | 4;
      teams_count: number;
      /** 'shamble' = klassisk best-2-preset; 'champagne' = arrangør valgte antall. */
      shamble_variant: 'shamble' | 'champagne';
      /** Hvor mange laveste score som teller per hull (1/2/3). Klampes til ≤ team_size i validator. Shamble-preset = 2. */
      shamble_count: 1 | 2 | 3;
      /** 'net' = gross − strokesForHole(CH, SI). 'gross' = rå gross. Default 'net'. Speiler skins_scoring. */
      shamble_scoring: 'gross' | 'net';
    }
  | {
      kind: 'patsome';
      team_size: 2;
      /** Antall lag (2+). Som texas_scramble. */
      teams_count: number;
      /**
       * 'net' = WHS-allowance per segment (4BBB full CH, greensome 60/40,
       * foursomes 50 % av sum). 'gross' = rå gross-stableford (ingen strokes).
       * Default 'net'. Speiler Wolf/Nassau/Skins/Nines-mønstret.
       */
      patsome_scoring: 'gross' | 'net';
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
  /**
   * Wolf-mode-spesifikk input: per-hull-valget fra `wolf_hole_choices`-tabellen.
   * Kun lest av wolf-modulen — andre moduser ignorerer feltet. Optional så
   * eksisterende ScoringContext-fixtures uten Wolf-data fortsetter å funke.
   */
  wolfChoices?: WolfHoleChoice[];
  /**
   * Bingo Bango Bongo-spesifikk input: per-hull-prestasjonsvalget fra
   * `bingo_bango_bongo_holes`-tabellen. Kun lest av bingoBangoBongo-modulen —
   * andre moduser ignorerer feltet. Optional så eksisterende
   * ScoringContext-fixtures uten BBB-data fortsetter å funke.
   * Speiler `wolfChoices?`-mønstret.
   */
  bingoBangoBongoHoles?: BingoBangoBongoHoleInput[];
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

export interface BestBallResult {
  kind: 'best_ball';
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
// Solo strokeplay (epic #46).
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
 * Per-spiller-rad i solo strokeplay-resultatet.
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
 * Per-spiller-celle på ett solo-strokeplay-hull. `net` = gross − tildelte slag.
 * Begge felt er `null` når hullet ikke er spilt (pick-up / ikke tastet) — IKKE
 * 999-padding-verdien ranking-cascaden bruker internt.
 */
export interface SoloStrokeplayHolePlayerCell {
  userId: string;
  gross: number | null;
  net: number | null;
}

/**
 * Per-hull-rad for solo strokeplay (epic #496, PR 8). Mater den format-bevisste
 * «Hull for hull»-flaten (SoloStrokeplayHolesView) og head-to-head-momentum-
 * strippen. `bestUserIds` = spillerne med lavest netto blant de som spilte
 * hullet (tom hvis ingen; lengde > 1 ved delt).
 */
export interface SoloStrokeplayHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  perPlayer: SoloStrokeplayHolePlayerCell[];
  bestUserIds: string[];
}

/**
 * Solo strokeplay-resultat — én rad per spiller. Returnert når
 * `game_mode === 'solo_strokeplay'`. Ingen variant-discriminator;
 * solo er den eneste varianten i v1.
 */
export interface SoloStrokeplayResult {
  kind: 'solo_strokeplay';
  players: SoloStrokeplayPlayerLine[];
  /** Per-hull per-spiller-detalj (alle hull, sortert). Epic #496, PR 8. */
  holes: SoloStrokeplayHoleRow[];
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
// bestBall for missing-hull (0-padding i ranking-array).
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

// -----------------------------------------------------------------------------
// Foursomes matchplay (issue #218, fase 3 av #47).
//
// 2v2 alternate-shot matchplay: én ball per lag, partnerne alternerer slag.
// Lag-score per hull → matchplay-sammenligning side 1 vs side 2. Storage
// følger Texas-mønsteret: lag-kapteinen (lex-min userId) eier scores-radene,
// non-captain-partneren skriver til samme rad via UI-routing.
//
// Allowance-pipeline (skiller seg fra fourball):
//   highSideExtraHCP = round(|side1CombinedCH − side2CombinedCH| × pct / 100)
//   side1Extra = highSideNumber === 1 ? strokesForHole(highSideExtraHCP, SI) : 0
//   side2Extra = highSideNumber === 2 ? strokesForHole(highSideExtraHCP, SI) : 0
// WHS-default pct = 50. Lavlaget får 0 strokes; høylaget får diff-strokene
// allokert via SI (hardeste hull først). 0 % = brutto-matchplay.
//
// Re-bruker `MatchplayHoleResult` og `MatchplayMatchResult` fra singles —
// match-resultat-format-strenger («3&2», «AS», «2up») er identisk.
// -----------------------------------------------------------------------------

/**
 * Spiller-detalj på en foursomes-side. Begge partnere kontribuerer til
 * `combinedCourseHandicap`-summen på sidens nivå; per-spiller-strokes finnes
 * IKKE (foursomes spiller én ball per lag).
 */
export interface FoursomesSidePlayer {
  userId: string;
  courseHandicap: number;
  /**
   * Sidens spillers tee-gender (fra `game_players.tee_gender`). Kapteinens
   * teeGender brukes som side-referanse for par-display (samme forenkling
   * som Texas-scramble). #240.
   */
  teeGender?: ScoringGender;
}

/**
 * Én av de to sidene i en foursomes matchplay-match. `captainUserId` (lex-min)
 * eier scores-radene i DB; UI ruter writeScore til kapteinen uansett hvem som
 * taster. `combinedCourseHandicap` er sum av partnernes courseHandicap (før
 * allowance). `effectiveExtraHandicap` er strokene siden får ved SI-allokering
 * — 0 på lavlaget, `round(|diff| × pct/100)` på høylaget.
 */
export interface FoursomesSide {
  /** 1 eller 2 — matcher game_players.team_number for foursomes-spillere. */
  sideNumber: 1 | 2;
  /** Begge partnere, sortert deterministisk på userId for stabil UI. */
  players: [FoursomesSidePlayer, FoursomesSidePlayer];
  /** Lex-min userId av de to partnerne. Eier scores-radene. */
  captainUserId: string;
  /** Sum av partnernes courseHandicap (før allowance-reduksjon). */
  combinedCourseHandicap: number;
  /**
   * Strokes som siden får i matchplay. 0 på low-side; `round(|diff| × pct/100)`
   * på high-side. SI-allokering bruker denne verdien.
   */
  effectiveExtraHandicap: number;
}

/**
 * Per-hull-rad i en foursomes matchplay-match. Lag-gross hentes fra
 * kaptein-eide scores-rad; lag-extra-strokes kommer fra
 * `strokesForHole(effectiveExtraHandicap, SI)` for high-side, 0 for low-side.
 */
export interface FoursomesHoleRow {
  holeNumber: number;
  /**
   * Bevart for backward-compat. Sett lik `side1Par` slik at konsumenter som
   * tidligere leste én felles par-verdi fortsatt fungerer. UI-laget bør bruke
   * `side1Par`/`side2Par` direkte ved blandet-kjønn-par.
   */
  par: number;
  /**
   * Per-side par fra `parFor(hole, captain.teeGender)`. Kapteinens teeGender
   * representerer siden (samme forenkling som Texas). #240.
   */
  side1Par: number;
  side2Par: number;
  strokeIndex: number;
  /** Lag-gross per side fra kaptein-eide scores-rad. null = ikke spilt. */
  side1Gross: number | null;
  side2Gross: number | null;
  /** Extra strokes per side fra SI-allokering. 0 på low-side. */
  side1Extra: number;
  side2Extra: number;
  /** Lag-netto per side (gross − extra). null hvis gross er null. */
  side1Net: number | null;
  side2Net: number | null;
  /** Hvem vant hullet via `classifyMatchplayHole(side1Net, side2Net)`. */
  result: MatchplayHoleResult;
}

/**
 * Resultat fra `foursomesMatchplay.compute()`. Speiler `SinglesMatchplayResult`
 * og `FourballMatchplayResult` tett — 2 sider à 2 spillere, ett lag-gross per
 * side per hull. `result`-feltet og match-format-strenger («3&2», «AS», «2up»)
 * er identiske med singles og fourball via gjenbruk av `computeMatchResult`.
 */
export interface FoursomesMatchplayResult {
  kind: 'foursomes_matchplay';
  /** Tuple: alltid to sider, sortert side 1 så side 2. */
  sides: [FoursomesSide, FoursomesSide];
  holes: FoursomesHoleRow[];
  /** side1-hull-vinst − side2-hull-vinst. Positiv = side 1 up. */
  holesUp: number;
  /** Antall hull der begge sider har lag-gross. */
  holesPlayed: number;
  /** `max(0, 18 − holesPlayed)`. */
  holesRemaining: number;
  /**
   * `null` = matchen er ikke avgjort ennå.
   * Et `MatchplayMatchResult`-objekt = mat-em eller spilt 18 hull.
   */
  result: MatchplayMatchResult | null;
}

// -----------------------------------------------------------------------------
// Wolf (issue #274; #465 — 3-5-spiller rotating partner-format).
//
// Hver spiller har en `team_number` 1..n (n=3-5) som er rotation-slot (random
// permutasjon satt av wizard ved opprett). La R = floor(18/n)*n. Wolf-spilleren
// skifter per hull:
//   - Hull 1..R: wolf = player med team_number === ((holeNumber - 1) % n) + 1
//   - Hull R+1..18: wolf = lavest totalPoints etter forrige hull
//                 (tiebreak: team_number ASC, deterministisk). n=3 → ingen.
//
// Per hull velger Wolf via `wolf_hole_choices`:
//   - 'partner': Wolf + valgt partner mot resten
//   - 'lone':    Wolf alene mot resten
//   - 'blind':   alene, deklarert FØR tee shots (honor-system)
//
// Point-tabell (justerbar via senere mode_config-utvidelse):
//   partner-side win:  2 × stake til hver av wolf+partner
//   partner-side loss: 1 × stake til hver motstander
//   lone win:          n × stake til wolf
//   lone loss:         1 × stake til hver motstander
//   blind win:         (n+2) × stake til wolf
//   blind loss:        2 × stake til hver motstander
//   tied:              0 til alle, stake carrier (+1) til neste hull
//
// Stake-mekanikk: base = 1. Tied hull → stake += 1 til neste. Avgjort hull
// → stake reset til 1 etter utbetaling. Pending hull (ikke valgt eller
// ikke spilt) bevarer stake uendret.
// -----------------------------------------------------------------------------

export type WolfChoice = 'partner' | 'lone' | 'blind';

export type WolfHoleOutcome =
  | 'wolf_side_wins'
  | 'opp_side_wins'
  | 'tied'
  | 'pending';

/**
 * Wolf-valg fra `wolf_hole_choices`-tabellen, normalisert til scoring-shape.
 * Lest av `computeLeaderboard()` for wolf-modus via en utvidet ScoringContext.
 */
export interface WolfHoleChoice {
  holeNumber: number;
  wolfUserId: string;
  choice: WolfChoice;
  /** Required når choice='partner', null ellers (CHECK håndhever det i DB). */
  partnerUserId: string | null;
}

/**
 * Per-spiller-detalj på et Wolf-hull. `side` reflekterer hvilken side
 * spilleren spilte på dette hullet (wolf-side eller opp-side); null når
 * hullet er pending eller spilleren ikke er Wolf og Wolf valgte 'lone'/'blind'
 * (alle 3 motstandere er på opp-side). `isContributor` flagger spillere
 * som hadde best score på sin side på dette hullet — kan være begge ved
 * tie innen en side (partner-modus, begge har samme netto).
 */
export interface WolfPlayerCell {
  userId: string;
  gross: number | null;
  /** Etter HCP-fordeling hvis wolf_scoring='net', ellers === gross. */
  effectiveScore: number | null;
  /** 'wolf' = Wolf-siden (Wolf+partner eller Wolf alene), 'opp' = de andre. */
  side: 'wolf' | 'opp' | null;
  /** Hadde best score på sin side på dette hullet. */
  isContributor: boolean;
}

export interface WolfHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** Spilleren som er Wolf på dette hullet (rotation eller trailing). */
  wolfUserId: string;
  /** null = ikke valgt ennå (outcome='pending'). */
  choice: WolfChoice | null;
  /** Required når choice='partner', null ellers. */
  partnerUserId: string | null;
  /**
   * Stake-multiplier for dette hullet. Base = 1, +1 per tied carry-over fra
   * forrige hull. Reset til 1 etter et avgjort hull. Pending/unplayed hull
   * bevarer stake uendret for neste hull.
   */
  stake: number;
  outcome: WolfHoleOutcome;
  /** Per-spiller-detalj for de 4 spillere på dette hullet. */
  players: WolfPlayerCell[];
  /**
   * Poeng utdelt på dette hullet, indeksert på userId. 0-verdi for spillere
   * som ikke fikk poeng. Tom for pending/tied (alle 0). UI summerer på tvers
   * av hullene for å vise totalpoeng.
   */
  pointsByPlayer: Record<string, number>;
}

/**
 * Per-spiller-rad i Wolf-leaderboard. Ranking: høyest totalPoints vinner.
 * Tiebreak (v1): siste Wolf-hull poeng, så team_number ASC (deterministisk).
 *
 * `wolfHolesPlayed` = hvor mange hull spilleren var Wolf (rotation +
 * eventuelle trailing-wolf-hull). `blindWolfWins` = bragging-stat for podium.
 */
export interface WolfPlayerLine {
  userId: string;
  teamNumber: number;
  totalPoints: number;
  wolfHolesPlayed: number;
  blindWolfWins: number;
  rank: number;
  tiedWith: string[];
}

export interface WolfResult {
  kind: 'wolf';
  scoring: 'gross' | 'net';
  /**
   * Hardkodet 'random_with_trailing' i v1 — random første 16 (lagret som
   * game_players.team_number), trailing-wolf siste 2. Feltet eksisterer
   * så fremtidige rotasjons-varianter kan legges til uten breaking type.
   */
  rotation: 'random_with_trailing';
  holes: WolfHoleRow[];
  players: WolfPlayerLine[];
}

// -----------------------------------------------------------------------------
// Nassau (issue #276 — front 9 + back 9 + total 18).
//
// Tre konkurranser i én runde. Hver seksjon er sin egen strokeplay-ranking
// (lavest sum av effective-strokes vinner). En spiller som vinner en seksjon
// alene får 1 unit; tie i seksjonen = push (ingen unit deles ut). Aggregert
// ranking på unit-count med total18-cascade som tiebreak.
//
// Gross/net-toggle som Wolf: mode_config.nassau_scoring = 'gross' | 'net'.
// -----------------------------------------------------------------------------

export interface NassauSectionLine {
  userId: string;
  /** Sum av effective-strokes (net hvis scoring='net', gross hvis 'gross'). */
  totalEffectiveStrokes: number;
  /** Sum av gross-strokes (vises ved siden av effective på leaderboard). */
  totalGrossStrokes: number;
  /** Antall hull spilt i seksjonen (0-9 for front/back, 0-18 for total). */
  holesPlayed: number;
  rank: number;
  /** Spillere med eksakt samme cascade-resultat. */
  tiedWith: string[];
}

export interface NassauSection {
  name: 'front9' | 'back9' | 'total18';
  /** Hullnumre i seksjonen: [1..9], [10..18], eller [1..18]. */
  holeNumbers: number[];
  players: NassauSectionLine[];
  /**
   * Vinnernes userIds for denne seksjonen.
   *  - Lengde 1: ren vinner, får 1 unit
   *  - Lengde >1: push (tied etter cascade) — ingen unit deles ut
   *  - Lengde 0: pending (ikke alle hull spilt ennå)
   */
  winnerUserIds: string[];
  /** True = ingen spiller har spilt alle hull i seksjonen ennå. */
  isPending: boolean;
}

export interface NassauUnitLine {
  userId: string;
  /** 0-3. Antall seksjoner spilleren vant alene. */
  units: number;
  unitBreakdown: { front9: boolean; back9: boolean; total18: boolean };
  /** Total18-effective-strokes som tiebreak ved units-tie. */
  total18EffectiveStrokes: number;
  rank: number;
  /** Spillere med eksakt samme (units, total18-cascade). */
  tiedWith: string[];
}

/**
 * Per-spiller-celle på ett Nassau-hull. `effective` er net (gross − tildelte
 * slag) eller gross, avhengig av `scoring`. Begge felt er `null` når hullet
 * ikke er spilt — IKKE 999-padding-verdien ranking-cascaden bruker internt.
 */
export interface NassauHolePlayerCell {
  userId: string;
  gross: number | null;
  effective: number | null;
}

/**
 * Per-hull-rad for Nassau (epic #496, PR 7). Mater den format-bevisste «Hull
 * for hull»-flaten (NassauHolesView) og head-to-head-momentum-strippen.
 * `section` er hull-tilhørigheten (front 9 / back 9); total18 er unionen, ikke
 * en egen hull-seksjon. `bestUserIds` = spillerne med lavest effective blant de
 * som spilte hullet (tom hvis ingen spilte; lengde > 1 ved delt).
 */
export interface NassauHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  section: 'front9' | 'back9';
  perPlayer: NassauHolePlayerCell[];
  bestUserIds: string[];
}

export interface NassauResult {
  kind: 'nassau';
  scoring: 'gross' | 'net';
  sections: {
    front9: NassauSection;
    back9: NassauSection;
    total18: NassauSection;
  };
  /** Aggregert unit-ranking — primær leaderboard-row på podium. */
  players: NassauUnitLine[];
  /** Per-hull per-spiller-detalj (alle 18, sortert). Epic #496, PR 7. */
  holes: NassauHoleRow[];
}

// -----------------------------------------------------------------------------
// Skins med carryover (issue #275 — hull-basert sosialt point-game).
//
// Hvert hull er verdt 1 skin. Lavest effective-score på hullet vinner skinnet.
// Blir hullet delt (≥2 spillere likt lavest), ruller skinnet videre (carryover)
// til neste hull — som da er verdt 2, så 3, osv. — til noen vinner alene og
// scooper hele potten. Carryover-state er en ren funksjon av scores (sekvensielt
// over hull i sortert rekkefølge).
//
// Pending: et hull der ikke alle spillere har score kan ikke avgjøres. Siden
// carryover er sekvensielt stopper resolving der — alle senere hull er også
// pending til gapet fylles. Potten fryses.
//
// Rundeslutt: hvis potten henger ved siste resolverte hull (delt siste hull)
// er disse skinsene uvunne — modulen eksponerer den rå `carriedPot`, og
// SkinsView avgjør label basert på gameStatus. Standard Skins, ingen omspill.
//
// Gross/net-toggle som Wolf/Nassau: mode_config.skins_scoring = 'gross' | 'net'.
// -----------------------------------------------------------------------------

export type SkinsHoleOutcome = 'won' | 'carryover' | 'pending';

export interface SkinsHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** Skins båret inn i dette hullet (0 = friskt hull). */
  carriedIn: number;
  /** carriedIn + 1 — skins på spill på dette hullet. */
  atStake: number;
  outcome: SkinsHoleOutcome;
  /** null hvis carryover/pending. */
  winnerUserId: string | null;
  /** = atStake hvis 'won', ellers 0. */
  skinsAwarded: number;
  perPlayer: Array<{
    userId: string;
    gross: number | null;
    /** gross hvis 'gross', netto hvis 'net'. null hvis hullet ikke spilt. */
    effectiveScore: number | null;
    /** Hadde (delt) lavest effective-score på hullet blant spilte. */
    isWinner: boolean;
  }>;
}

export interface SkinsPlayerLine {
  userId: string;
  /** Sum skins vunnet (inkl. carryover-pott scoopet). */
  totalSkins: number;
  /** Antall hull vunnet alene. */
  holesWon: number;
  rank: number;
  /** Spillere med eksakt samme (totalSkins, holesWon). */
  tiedWith: string[];
}

export interface SkinsResult {
  kind: 'skins';
  scoring: 'gross' | 'net';
  holes: SkinsHoleRow[];
  players: SkinsPlayerLine[];
  /**
   * Rå carryover-pott som henger ved siste resolverte hull — frozen
   * (pending-gap) eller ikke. Scoring-modulen kjenner ikke `gameStatus`, så
   * den eksponerer den rå verdien og lar konsumenten (SkinsView) avgjøre
   * label: «i potten» under aktivt spill vs «ikke vunnet» når spillet er
   * ferdig (delt siste spilte hull, evt. avsluttet tidlig med gap etterpå).
   * 0 når siste resolverte hull ble vunnet alene. Standard Skins, ingen omspill.
   */
  carriedPot: number;
}

// -----------------------------------------------------------------------------
// Bingo Bango Bongo (issue #277 — tres prestasjons-poeng per hull).
//
// Tre poeng per hull deles ut:
//   - Bingo: første ball på green
//   - Bango: nærmest hullet når alle baller er på green
//   - Bongo: første ball i hull
//
// Slag registreres via eksisterende scorekort (uendret maskineri), men teller
// IKKE for BBB-poeng. Poengene er rene prestasjons-poeng. Individuelt format,
// 2–16 spillere (#460), ingen lag (team_size: 1 — speiler solo_strokeplay).
//
// Tiebreak: totalPoints DESC → bingos DESC → bongos DESC → delt rank.
// Full 5-tier-cascade gjelder ikke (BBB er ikke slag-basert).
// -----------------------------------------------------------------------------

export interface BingoBangoBongoHoleInput {
  holeNumber: number;
  bingoUserId: string | null;
  bangoUserId: string | null;
  bongoUserId: string | null;
}

export interface BingoBangoBongoHoleRow {
  holeNumber: number;
  bingoUserId: string | null;
  bangoUserId: string | null;
  bongoUserId: string | null;
  /** 0–3 poeng per spiller på dette hullet. */
  pointsByPlayer: Record<string, number>;
}

export interface BingoBangoBongoPlayerLine {
  userId: string;
  bingos: number;
  bangos: number;
  bongos: number;
  /** bingos + bangos + bongos */
  totalPoints: number;
  rank: number;
  tiedWith: string[];
}

export interface BingoBangoBongoResult {
  kind: 'bingo_bango_bongo';
  holes: BingoBangoBongoHoleRow[];
  players: BingoBangoBongoPlayerLine[];
}

// -----------------------------------------------------------------------------
// Nines / Split Sixes (issue #278 — 3-spiller poeng-fordeling per hull).
//
// Hvert hull deler ut en fast pott etter effective-score-rangering blant de 3
// spillerne:
//   - Nines:       9 poeng — lavest 5, nest 3, høyest 1
//   - Split Sixes: 6 poeng — lavest 4, nest 2, høyest 0
//
// Likt deles likt: spillere med EKSAKT samme effective-score danner en gruppe;
// poengene for plassene gruppa opptar legges sammen og deles likt. F.eks. to
// delt lavest i Nines: (5+3)/2 = 4 hver, tredje får 1.
//
// Pending-hull: mangler minst én spiller gross → hullet deler ikke ut poeng
// (alle 0), teller ikke i holesScored. Ingen carryover — uavhengig per hull
// (skiller seg fra Skins). Senere hull avgjøres normalt.
//
// Net vs gross (gjenbruk av effectiveFor-mønsteret fra skins.ts):
//   - 'gross': effectiveScore = gross direkte (HCP ignoreres).
//   - 'net':   effectiveScore = gross − strokesForHole(courseHandicap, SI).
//
// Ranking: totalPoints DESC, tiebreak tiedWith på EKSAKT lik total (deterministisk
// userId-fallback for stabil rekkefølge). Full 5-tier-cascade utelates i v1
// (samme avgjørelse som Wolf/Skins).
// -----------------------------------------------------------------------------

export interface NinesHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** True når ikke alle spillere har gross — hullet deler ikke ut poeng. */
  pending: boolean;
  perPlayer: Array<{
    userId: string;
    gross: number | null;
    /** gross hvis 'gross', netto hvis 'net'. null hvis hullet ikke spilt. */
    effectiveScore: number | null;
    /** Poeng på dette hullet (0 når pending). */
    points: number;
  }>;
  /** Poeng per spiller på dette hullet (0 for alle når pending). */
  pointsByPlayer: Record<string, number>;
}

export interface NinesPlayerLine {
  userId: string;
  totalPoints: number;
  /** Antall ikke-pending hull spilleren bidro på. */
  holesScored: number;
  rank: number;
  /** Spillere med EKSAKT samme totalPoints. Tom for unike rader. */
  tiedWith: string[];
}

export interface NinesResult {
  kind: 'nines';
  variant: 'nines' | 'split_sixes';
  scoring: 'gross' | 'net';
  holes: NinesHoleRow[];
  players: NinesPlayerLine[];
}

// -----------------------------------------------------------------------------
// Shamble / Champagne Scramble (issue #285 — best N av M per hull).
//
// Lag-format. Delt drive, så alle spiller sin egen ball til hull. Lagets
// hull-score = sum av de N laveste individuelle effective-scorene. N er
// konfigurerbar via shamble_count (1/2/3). Strokeplay-utledet — egne score-
// rader som best ball / nines, ingen captain-rad.
//
// Shamble-preset: N låst til 2. Champagne Scramble: arrangør velger N.
// Net vs gross: speiler Wolf/Nassau/Skins/Nines-mønstret.
//
// Ranking: lavest totalScore vinner (strokeplay). 5-tier cascade via rankTeams
// på per-hull teamScore-arrays (total → back-9 → back-6 → back-3 → hull-18).
// -----------------------------------------------------------------------------

export interface ShambleHoleTeamCell {
  teamNumber: number;
  /**
   * Sum av de `count` laveste effective-scorene på hullet. Null når pending
   * (< count medlemmer har gross).
   */
  teamScore: number | null;
  /** True når < count teammedlemmer har gross på hullet. */
  pending: boolean;
  /** Per-spiller-detalj for ALLE teammedlemmer på hullet. */
  perPlayer: Array<{
    userId: string;
    gross: number | null;
    /** gross hvis scoring='gross'; gross − strokes hvis scoring='net'. Null hvis gross er null. */
    effectiveScore: number | null;
    /** Blant de `count` laveste effective-scorene som ble summert. */
    counted: boolean;
  }>;
}

export interface ShambleHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** Én cell per lag, sortert teamNumber stigende. */
  teams: ShambleHoleTeamCell[];
}

export interface ShambleTeamLine {
  teamNumber: number;
  /** userIds for alle teammedlemmer. */
  members: string[];
  /** Sum av ikke-pending hull-scorer. */
  totalScore: number;
  /** Antall hull med ikke-pending teamScore. */
  holesCounted: number;
  rank: number;
  /** teamNumbers med eksakt samme rank etter 5-tier cascade. */
  tiedWith: number[];
}

export interface ShambleResult {
  kind: 'shamble';
  /** Hvilken variant som ble spilt. */
  variant: 'shamble' | 'champagne';
  /** Antall laveste effective-scorer som teller per hull (1/2/3). */
  count: 1 | 2 | 3;
  /** Gross/net-modus. */
  scoring: 'gross' | 'net';
  /** Antall spillere per lag (3 eller 4). */
  teamSize: 3 | 4;
  /** Per-hull-rader — én per hull i ctx.holes, sortert hull-nummer stigende. */
  holes: ShambleHoleRow[];
  /** Per-lag-rader — sortert rank stigende (lavest totalScore = rank 1). */
  teams: ShambleTeamLine[];
}

/**
 * Per-spiller-detalj på ett Round Robin-hull. Speiler `FourballPlayerCell`
 * tett — gross → extraStrokes → net pipeline og isContributor-flag.
 */
export interface RoundRobinPlayerCell {
  userId: string;
  gross: number | null;
  /** Extra strokes for hullet fra SI-allokering (etter allowance). */
  extraStrokes: number;
  /** Netto = gross − extra. Null hvis gross er null. */
  net: number | null;
  /** Hadde side-best netto på hullet (kan være begge ved tie). */
  isContributor: boolean;
  /** Spillerens par for hullet (`parFor(hole, player.teeGender)`). #240. */
  par: number;
}

/**
 * Per-hull-rad i et Round Robin-spill. Inneholder begge siders 2 spillere med
 * per-spiller-detalj, lag-best-netto per side, og hvem som vant hullet.
 * `segment` (1/2/3) forteller hvilken rotasjonsfase hullet tilhører.
 */
export interface RoundRobinHoleRow {
  holeNumber: number;
  segment: 1 | 2 | 3;
  /**
   * Bevart for backward-compat. Satt lik `side1Par` slik at konsumenter
   * som leser én felles par-verdi fortsatt fungerer. #240.
   */
  par: number;
  /** Per-side par fra `parFor(hole, side.teeGender)`. */
  side1Par: number;
  side2Par: number;
  strokeIndex: number;
  /** Hvem som utgjør side 1 på DETTE hullet (avhenger av segment). */
  side1PlayerIds: [string, string];
  /** Hvem som utgjør side 2 på DETTE hullet (avhenger av segment). */
  side2PlayerIds: [string, string];
  /** Per-spiller-detalj for side 1 (alltid 2 spillere). */
  side1Players: RoundRobinPlayerCell[];
  /** Per-spiller-detalj for side 2 (alltid 2 spillere). */
  side2Players: RoundRobinPlayerCell[];
  /**
   * Lag-best netto per side. Null hvis ingen av partnerne har gross.
   * Best-ball-tradisjon: én partner med gross holder for at siden har best.
   */
  side1BestNet: number | null;
  side2BestNet: number | null;
  /** UserIds som hadde lag-best netto. Tom-array når siden er unplayed. */
  side1ContributorIds: string[];
  side2ContributorIds: string[];
  /** Hvem vant hullet via `classifyMatchplayHole`. */
  result: MatchplayHoleResult;
  /**
   * 0 eller 1 per spiller på dette hullet.
   * 1 = spillerens side vant hullet; 0 = tapte, delte eller unplayed.
   */
  holeWinByPlayer: Record<string, number>;
}

/**
 * Per-segment-sammendrag for én spiller. Forteller hvem spilleren spilte
 * MED og MOT i segmentet, og resultater for de 6 hullene i segmentet.
 */
export interface RoundRobinSegmentLine {
  segment: 1 | 2 | 3;
  /** Hullnumre i segmentet: [1..6] | [7..12] | [13..18]. */
  holeNumbers: number[];
  /** Hvem spilleren spilte MED (partner) i dette segmentet. */
  partnerUserId: string;
  /** Hvem spilleren spilte MOT (begge to) i dette segmentet. */
  opponentUserIds: [string, string];
  /** Antall hull spillerens side vant i segmentet. */
  holesWon: number;
  holesLost: number;
  holesHalved: number;
}

/**
 * Per-spiller-rad i Round Robin-leaderboard. Primær rangering på
 * `totalHoleWins`; fullt segment-sammendrag for de 3 konstellasjonene.
 *
 * Rangering: totalHoleWins DESC → totalHolesLost ASC → teamNumber ASC.
 * (Full 5-tier-cascade gjelder ikke — Round Robin er ikke slag-basert.)
 * `tiedWith` lister userIds med eksakt lik (totalHoleWins, totalHolesLost).
 */
export interface RoundRobinPlayerLine {
  userId: string;
  /** Slot 1-4 (A/B/C/D). Brukt som deterministisk tiebreak. */
  teamNumber: number;
  /** Totalt hull-seire over 18 hull (primær rangering). */
  totalHoleWins: number;
  totalHolesLost: number;
  totalHolesHalved: number;
  /** Alltid 3 segmenter — én per 6-hulls-fase. */
  segments: RoundRobinSegmentLine[];
  rank: number;
  tiedWith: string[];
}

/**
 * Resultat fra `roundRobin.compute()`. Inneholder per-hull-rader og
 * per-spiller-linjer med totaler + segment-sammendrag.
 */
export interface RoundRobinResult {
  kind: 'round_robin';
  allowancePct: number;
  holes: RoundRobinHoleRow[];
  players: RoundRobinPlayerLine[];
}

// Acey Deucey (issue #279 — 4-spiller per-hull point-game).
//
// Per hull: unikt lavest effective score → +3 (ace); unikt høyest → −3 (deuce);
// de to midtre → 0. Delt lavest/høyest → den siden deles ikke ut, uavhengig.
// Hull der ikke alle 4 har score → scored=false, alle 0, men ingen frys.
// Løpende total kan bli negativ. Brutto/netto-toggle som Wolf/Nassau/Skins.
// -----------------------------------------------------------------------------

/**
 * Per-hull-rad i Acey Deucey. `scored=true` betyr at alle 4 spillere hadde
 * effective score og poeng ble distribuert (aceUserId/deuceUserId kan likevel
 * være null hvis den siden var delt). `scored=false` betyr ufullstendig hull —
 * alle 0, men later hulls prosesseres uavhengig.
 */
export interface AceyDeuceyHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  /** True = alle 4 spillere hadde score dette hullet. */
  scored: boolean;
  /** Spillerens userId som hadde unikt lavest effective score, ellers null. */
  aceUserId: string | null;
  /** Spillerens userId som hadde unikt høyest effective score, ellers null. */
  deuceUserId: string | null;
  /** +3 / 0 / −3 per spiller dette hullet, indeksert på userId. */
  pointsByPlayer: Record<string, number>;
  /**
   * Per-spiller-detalj for «Hull for hull»-flaten (#496 PR 5), i ctx.players-
   * rekkefølge. `effectiveScore` = gross hvis 'gross', netto hvis 'net'; null
   * når hullet ikke er spilt for spilleren. `points` = +3/0/−3 (0 når uferdig).
   */
  perPlayer: Array<{
    userId: string;
    gross: number | null;
    effectiveScore: number | null;
    points: number;
  }>;
}

/**
 * Per-spiller-rad i Acey Deucey-leaderboard. `total` kan være negativ
 * (deuce-akkumulering). Ranking: total DESC → aces DESC → delt rank.
 */
export interface AceyDeuceyPlayerLine {
  userId: string;
  /** Antall hull der spilleren var unik lavest (ace). */
  aces: number;
  /** Antall hull der spilleren var unik høyest (deuce). */
  deuces: number;
  /** Sum av +3/0/−3 over alle hull (kan være negativ). */
  total: number;
  rank: number;
  /** Spillere med eksakt samme (total, aces) — delt rank. */
  tiedWith: string[];
}

export interface AceyDeuceyResult {
  kind: 'acey_deucey';
  scoring: 'gross' | 'net';
  holes: AceyDeuceyHoleRow[];
  players: AceyDeuceyPlayerLine[];
}

// -----------------------------------------------------------------------------
// Patsome (issue #286 — 6 hull 4BBB → 6 greensome → 6 foursomes).
//
// Rotasjons-format: 18 hull delt i tre 6-hulls-segmenter, hvert med sin
// lagspill-form. Felles valuta = stableford-poeng per lag per hull.
//
//   Hull 1–6:   4BBB       — begge spiller, MAX-av-to stableford per hull.
//   Hull 7–12:  Greensome  — én lagball (kaptein-eide rad). Allowance 60/40.
//   Hull 13–18: Foursomes  — én lagball (kaptein-eide rad). Allowance 50%.
//
// Lagets total = sum av stableford-poeng over alle 18 hull. Høyest vinner.
// Ranking via `rankTeams` med negerte per-hull-poeng (5-tier cascade).
// Forutsetter 18 hull — degraderer trygt (manglende hull = 0 poeng).
// -----------------------------------------------------------------------------

export type PatsomeSegment = 'fourball' | 'greensome' | 'foursomes';

export interface PatsomePlayerCell {
  userId: string;
  gross: number | null;
  /** net = gross − extra (eller = gross i brutto). null hvis ikke spilt. */
  netStrokes: number | null;
  points: number;
  /** Kun meningsfull i 4BBB (MAX-bidragsyter). false i 1-ball-segmentene. */
  isContributor: boolean;
}

export interface PatsomeHoleRow {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  segment: PatsomeSegment;
  /** 4BBB: begge spiller-celler. greensome/foursomes: tom (bruk teamGross). */
  players: PatsomePlayerCell[];
  /** 4BBB: userIds med MAX-poeng. greensome/foursomes: tom. */
  contributorIds: string[];
  /** greensome/foursomes: lag-ball-gross. 4BBB: null. */
  teamGross: number | null;
  /** Lag-strokes på hullet for 1-ball-segmentene (0 i brutto / i 4BBB). */
  teamExtraStrokes: number;
  /** greensome/foursomes: lag-ball-netto. 4BBB: null. */
  teamNetStrokes: number | null;
  /** Lag-hull-poeng (valutaen). 4BBB: MAX. 1-ball: lag-ballens poeng. */
  teamPoints: number;
}

export interface PatsomeSegmentSubtotal {
  segment: PatsomeSegment;
  points: number;
  holesPlayed: number;
}

export interface PatsomeTeamLine {
  teamNumber: number;
  playerIds: string[];
  captainUserId: string;
  holes: PatsomeHoleRow[];
  segments: {
    fourball: PatsomeSegmentSubtotal;
    greensome: PatsomeSegmentSubtotal;
    foursomes: PatsomeSegmentSubtotal;
  };
  totalPoints: number;
  rank: number;
  tiedWith: number[];
}

export interface PatsomeResult {
  kind: 'patsome';
  scoring: 'gross' | 'net';
  teams: PatsomeTeamLine[];
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
 * For solo_strokeplay narrower man på `kind` og leser `players`
 * direkte — solo er den eneste varianten i v1.
 *
 * For texas_scramble narrower man på `kind` og leser `teams` direkte —
 * kun team-variant i v1 (3-mannslag utsatt).
 *
 * For wolf narrower man på `kind` og leser `holes`/`players` direkte —
 * kun én variant i v1 (random_with_trailing).
 *
 * For bingo_bango_bongo narrower man på `kind` og leser `holes`/`players`
 * direkte. Ingen variant-discriminator — individuelt format, ingen lag.
 *
 * For round_robin narrower man på `kind` og leser `holes`/`players` direkte.
 * `players` er sortert etter rangering (totalHoleWins DESC).
 */
export type ModeResult =
  | BestBallResult
  | StablefordResult
  | SinglesMatchplayResult
  | SoloStrokeplayResult
  | TexasScrambleResult
  | FourballMatchplayResult
  | FoursomesMatchplayResult
  | WolfResult
  | NassauResult
  | SkinsResult
  | BingoBangoBongoResult
  | NinesResult
  | RoundRobinResult
  | AceyDeuceyResult
  | ShambleResult
  | PatsomeResult;
