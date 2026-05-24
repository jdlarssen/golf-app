// Shared helpers for parsing and validating the admin "create game" / "edit
// game" form payload. Used by both the new-game and edit-game server actions.
//
// Arkitektur (epic #41):
//   buildGameInsertPayload delegerer per modus. Felles base-parsing skjer
//   først (navn, course, tee, allowance, visibility), så slår
//   modeValidators[mode] inn med modus-spesifikk player-validering og
//   bygger mode_config-objektet som persisterer til games.mode_config.
//
// Bakoverkompatibilitet: form-feltet `game_mode` defaultes til
// 'best_ball_netto' hvis det mangler — UI-velgeren introduseres først i
// fase 4. Eksisterende admin-flyt produserer derfor samme payload som før.

import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';

/**
 * Parse a 'YYYY-MM-DDTHH:mm' string (as emitted by <input type="datetime-local">)
 * as wall-clock time in Europe/Oslo and return the corresponding UTC ISO string.
 *
 * Strategy: ask Intl what the timezone-name short label is for the given Oslo
 * wall-clock date (CET = GMT+1, CEST = GMT+2). Append the matching offset
 * suffix and let `new Date()` parse the offset-bearing string into UTC.
 * This handles DST transitions correctly for any non-ambiguous wall-clock
 * instant. (Ambiguous instants — the autumn fall-back hour — are vanishingly
 * rare for golf tee-offs and fall back to the post-transition offset.)
 *
 * Throws RangeError on malformed input.
 */
export function parseOsloDateTimeLocal(s: string): string {
  const [datePart] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  // Probe at noon UTC on the target date: avoids straddling the midnight
  // DST boundary and yields the right offset for the day.
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Oslo',
    timeZoneName: 'short',
  });
  const tzPart = fmt
    .formatToParts(probe)
    .find((p) => p.type === 'timeZoneName')?.value;
  const offset = tzPart === 'GMT+2' ? '+02:00' : '+01:00';
  const result = new Date(`${s}:00${offset}`);
  if (Number.isNaN(result.getTime())) {
    throw new RangeError(`Invalid Oslo datetime-local: ${s}`);
  }
  return result.toISOString();
}

export type GamePlayerInput = {
  user_id: string;
  /**
   * Nullable since 0030_game_modes: solo-modus (stableford) lar lag-tilordning
   * stå tom. Best-ball-modus krever fortsatt 1..4 og håndheves av
   * best-ball-validatoren før payloaden persisteres.
   */
  team_number: number | null;
  /**
   * Nullable av samme grunn som team_number. CHECK-constraint
   * `game_players_team_flight_consistency` garanterer at de er satt eller
   * null sammen, så validatorene må alltid sette/null begge sammen.
   */
  flight_number: number | null;
};

export type PayloadMode = 'draft' | 'publish';

export type GameValidationErrorCode =
  | 'name_required'
  | 'course_required'
  | 'tee_required'
  | 'bad_allowance'
  | 'players_required'
  | 'duplicate_player'
  | 'bad_team'
  | 'bad_flight'
  | 'team_balance'
  // Mode-relaterte koder (innført med multi-mode-arkitektur, epic #41):
  // - mode_required: form mangler eller har ugyldig `game_mode`-verdi.
  // - unsupported_mode_size_combo: mode + team_size matcher ikke en aktiv
  //   kombinasjon (f.eks. par-stableford som ikke er implementert ennå).
  // - min_players_for_mode: publish krever flere spillere enn payloaden har
  //   for den valgte modusen (stableford: min 1, best-ball: eksakt 8).
  // - mode_locked_after_publish: edit-flow forsøker å endre game_mode etter
  //   at spillet har forlatt 'draft'-state (scheduled/active/finished).
  | 'mode_required'
  | 'unsupported_mode_size_combo'
  | 'min_players_for_mode'
  | 'mode_locked_after_publish'
  // Matchplay-spesifikke koder (epic #45):
  // - too_many_players_for_mode: publish for singles_matchplay må ha EKSAKT
  //   2 spillere (én per side). Brukes for å skille "for mange" fra "for få"
  //   (min_players_for_mode) — gir tydeligere norsk feilmelding i admin-UI.
  | 'too_many_players_for_mode';

export type ParsedPayload = {
  name: string;
  course_id: string | null;
  tee_box_id: string | null;
  hcp_allowance_pct: number;
  require_peer_approval: boolean;
  /** 'live' = netto visible from hole 1. 'reveal' = netto hidden until status='finished'. */
  score_visibility: 'live' | 'reveal';
  players: GamePlayerInput[];
  /**
   * Discriminator for spillmodus. Speilar `games.game_mode`-kolonnen
   * (innført i 0030_game_modes). Brukes av actions for å persisterte
   * raden riktig og av mode-router-en i lib/scoring/index.ts.
   */
  game_mode: GameMode;
  /**
   * Modus-spesifikk konfig som persisterer til `games.mode_config` (JSONB).
   * Diskrimineres på `kind` slik at konsumenter kan narrowe trygt på modusen.
   */
  mode_config: GameModeConfig;
  errorCode?: GameValidationErrorCode;
};

/** Felles base-felter parset fra FormData, før modus-spesifikk validering. */
type ParsedBase = Omit<ParsedPayload, 'players' | 'game_mode' | 'mode_config' | 'errorCode'>;

/**
 * Resultat fra en modus-spesifikk validator. Suksess gir den ferdige
 * spillerlisten + mode_config; feil returnerer kun en feilkode.
 */
type ModeValidationResult =
  | { ok: true; players: GamePlayerInput[]; mode_config: GameModeConfig }
  | { ok: false; errorCode: GameValidationErrorCode };

/** Parser felles felter som er identiske mellom alle moduser. */
function parseBase(formData: FormData): ParsedBase {
  const name = String(formData.get('name') ?? '').trim();
  const rawCourse = String(formData.get('course_id') ?? '').trim();
  const rawTee = String(formData.get('tee_box_id') ?? '').trim();
  const rawAllowance = formData.get('hcp_allowance_pct');
  const parsedAllowance =
    rawAllowance === null || rawAllowance === ''
      ? 100
      : Number(rawAllowance);
  const hcp_allowance_pct = Number.isFinite(parsedAllowance)
    ? parsedAllowance
    : 100;
  const require_peer_approval =
    formData.get('require_peer_approval') === 'on';
  // Reveal-modus toggle. Invalid / missing values silently fall back to 'live'
  // (the safe default) so neither stale form state nor DevTools tampering can
  // produce a CHECK-constraint failure on the DB column.
  const rawVisibility = String(formData.get('score_visibility') ?? '').trim();
  const score_visibility: 'live' | 'reveal' =
    rawVisibility === 'reveal' ? 'reveal' : 'live';

  return {
    name,
    course_id: rawCourse || null,
    tee_box_id: rawTee || null,
    hcp_allowance_pct,
    require_peer_approval,
    score_visibility,
  };
}

/**
 * Leser `game_mode` fra form-data. Defaulter til `best_ball_netto` hvis
 * feltet mangler — bevarer bakoverkompatibilitet inntil ModeSelector
 * (fase 4) wires inn en eksplisitt verdi. Ukjente verdier returnerer
 * null så top-level kan svare med `mode_required`.
 */
function parseGameMode(formData: FormData): GameMode | null {
  const raw = String(formData.get('game_mode') ?? '').trim();
  if (raw === '') return 'best_ball_netto';
  if (
    raw === 'best_ball_netto' ||
    raw === 'stableford' ||
    raw === 'singles_matchplay' ||
    raw === 'solo_strokeplay_netto' ||
    raw === 'texas_scramble'
  )
    return raw;
  return null;
}

/**
 * Best-ball-netto-validator. Beholder dagens regler 1:1:
 *  - publish krever eksakt 8 spillere fordelt 2-2-2-2 på 4 lag
 *  - draft tillater partial state (0..8 spillere), men team/flight rangen
 *    blir likevel validert per ikke-tom rad
 *  - duplikat-sjekk gjelder begge moduser
 *
 * Mode_config-output speiler 0030-backfill: `{kind, team_size: 2, teams_count: 4}`.
 */
function validateBestBallNetto(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) {
      if (mode === 'publish') {
        return { ok: false, errorCode: 'players_required' };
      }
      continue; // draft: skip empty slot
    }
    if (seen.has(user_id)) {
      return { ok: false, errorCode: 'duplicate_player' };
    }
    seen.add(user_id);
    const team_number = Number(formData.get(`player_${i}_team`));
    const flight_number = Number(formData.get(`player_${i}_flight`));
    if (!Number.isInteger(team_number) || team_number < 1 || team_number > 4) {
      return { ok: false, errorCode: 'bad_team' };
    }
    if (
      !Number.isInteger(flight_number) ||
      flight_number < 1 ||
      flight_number > 4
    ) {
      return { ok: false, errorCode: 'bad_flight' };
    }
    players.push({ user_id, team_number, flight_number });
  }

  if (mode === 'publish') {
    const teamCounts = new Map<number, number>();
    for (const p of players) {
      if (p.team_number === null) continue;
      teamCounts.set(p.team_number, (teamCounts.get(p.team_number) ?? 0) + 1);
    }
    for (let t = 1; t <= 4; t++) {
      if (teamCounts.get(t) !== 2) {
        return { ok: false, errorCode: 'team_balance' };
      }
    }
  }

  return {
    ok: true,
    players,
    mode_config: { kind: 'best_ball_netto', team_size: 2, teams_count: 4 },
  };
}

/**
 * Stableford-validator (solo + par/4BBB-varianter, epic #41 + #43).
 *
 * Switcher på form-feltet `stableford_team_size`:
 *  - 1 (eller mangler/ugyldig) → solo (eksisterende oppførsel)
 *  - 2 → par-stableford (4BBB) — krever team_number + flight_number per
 *    spiller og EKSAKT 2 spillere per lag ved publish
 *
 * Bakoverkompatibilitet: hvis `stableford_team_size` mangler eller har
 * en ukjent verdi defaulter vi til 1 (solo). Det bevarer den eksisterende
 * UI-flyten fra epic #41 inntil TeamSizeSelector wires inn par-valget
 * i Phase 2 av epic #43.
 *
 * Player-slot-loopen leser opp til 8 slots fordi det er øvre grense fra
 * dagens GameForm — kan utvides for stor-turneringer i en senere fase
 * uten skjema-endring.
 */
function validateStableford(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const teamSize = parseStablefordTeamSize(formData);
  if (teamSize === 2) {
    return validateStablefordTeam(formData, mode);
  }
  return validateStablefordSolo(formData, mode);
}

/**
 * Leser `stableford_team_size` fra form-data. Defaulter til 1 (solo) hvis
 * feltet mangler eller har en ugyldig verdi. Bevarer bakoverkompatibilitet
 * med eksisterende solo-flyt fra epic #41.
 */
function parseStablefordTeamSize(formData: FormData): 1 | 2 {
  const raw = String(formData.get('stableford_team_size') ?? '').trim();
  if (raw === '2') return 2;
  return 1;
}

/**
 * Solo-stableford-validator (team_size=1). Spillere får team_number /
 * flight_number = null, uavhengig av om form-en har stale verdier fra
 * et tidligere best-ball-utkast. DB-CHECK i 0030 krever team/flight
 * konsistent null-or-not-null, så vi MÅ nullstille begge.
 *
 * Mode_config-output: `{kind, team_size: 1, points_table: 'standard'}`.
 */
function validateStablefordSolo(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) continue;
    if (seen.has(user_id)) {
      return { ok: false, errorCode: 'duplicate_player' };
    }
    seen.add(user_id);
    players.push({ user_id, team_number: null, flight_number: null });
  }

  if (mode === 'publish' && players.length < 1) {
    return { ok: false, errorCode: 'min_players_for_mode' };
  }

  return {
    ok: true,
    players,
    mode_config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
  };
}

/**
 * Par-stableford-validator (team_size=2 / 4BBB).
 *
 * Regler:
 *  - hver spiller må ha team_number og flight_number satt (positive heltall)
 *  - flight_number = team_number for par-stableford (par-stableford bruker
 *    ikke flights uavhengig av lag — vi mapper dem 1:1 for å oppfylle
 *    DB-CHECK `game_players_team_flight_consistency` som krever begge satt
 *    eller null sammen)
 *  - publish krever EKSAKT 2 spillere per lag, minst 1 lag (ingen øvre
 *    grense — admin kan kjøre stort antall lag for klubb-turnering)
 *  - duplikat-sjekk uendret
 *  - draft tolererer partial state (ufullstendige lag, færre enn 2 per lag)
 *
 * Mode_config-output: `{kind, team_size: 2, points_table: 'standard'}`.
 *
 * Player-slot-loopen leser opp til 8 slots fra dagens GameForm — par-
 * stableford kan utvides forbi dette i en senere fase uten skjema-endring
 * (samme begrensning som solo).
 */
function validateStablefordTeam(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) continue;
    if (seen.has(user_id)) {
      return { ok: false, errorCode: 'duplicate_player' };
    }
    seen.add(user_id);
    const team_number = Number(formData.get(`player_${i}_team`));
    const flight_number = Number(formData.get(`player_${i}_flight`));
    // Par-stableford krever positive heltall (ingen øvre grense i v1 —
    // klubb-turneringer kan ha mange lag). Negative tall, NaN og null
    // avvises som bad_team / bad_flight.
    if (!Number.isInteger(team_number) || team_number < 1) {
      return { ok: false, errorCode: 'bad_team' };
    }
    if (!Number.isInteger(flight_number) || flight_number < 1) {
      return { ok: false, errorCode: 'bad_flight' };
    }
    players.push({ user_id, team_number, flight_number });
  }

  if (mode === 'publish') {
    if (players.length === 0) {
      // Helt tom spillerliste → ingen lag i det hele tatt. Behandles som
      // "modus uten spillere" snarere enn "lag i ubalanse".
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    const teamCounts = new Map<number, number>();
    for (const p of players) {
      if (p.team_number === null) continue;
      teamCounts.set(p.team_number, (teamCounts.get(p.team_number) ?? 0) + 1);
    }
    // Hvert lag må ha EKSAKT 2 spillere — det er kjernen i 4BBB.
    for (const [, count] of teamCounts) {
      if (count !== 2) {
        return { ok: false, errorCode: 'team_balance' };
      }
    }
  }

  return {
    ok: true,
    players,
    mode_config: { kind: 'stableford', team_size: 2, points_table: 'standard' },
  };
}

/**
 * Singles matchplay-validator (epic #45 — 1v1 net matchplay).
 *
 * Regler:
 *  - hver spiller MÅ ha team_number = 1 eller 2 (sideNumber for matchplay)
 *  - publish krever EKSAKT 2 spillere, én på side 1 og én på side 2
 *  - flight_number = team_number (samme pattern som par-stableford for å
 *    oppfylle DB-CHECK `game_players_team_flight_consistency` som krever
 *    begge satt eller null sammen)
 *  - duplikat-sjekk uendret
 *  - draft tolererer partial state (0..2 spillere, side-tilordning trenger
 *    ikke være balansert)
 *
 * Feilkoder ved publish:
 *  - 0 spillere → `min_players_for_mode`
 *  - 1 spiller → `min_players_for_mode`
 *  - >2 spillere → `too_many_players_for_mode`
 *  - 2 spillere men ikke én på hver side → `team_balance`
 *
 * Mode_config-output: `{kind, team_size: 1, teams_count: 2}`.
 */
function validateSinglesMatchplay(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) continue;
    if (seen.has(user_id)) {
      return { ok: false, errorCode: 'duplicate_player' };
    }
    seen.add(user_id);
    const team_number = Number(formData.get(`player_${i}_team`));
    // Matchplay-sider er strengt 1 eller 2. Andre verdier (NaN, 3+, negative)
    // avvises som bad_team — i draft blir feilen synlig først ved publish,
    // men inkonsistente rader bør ikke slippe gjennom uansett modus siden
    // DB-CHECK `game_players_team_flight_consistency` krever begge satt
    // eller null sammen.
    if (
      !Number.isInteger(team_number) ||
      team_number < 1 ||
      team_number > 2
    ) {
      return { ok: false, errorCode: 'bad_team' };
    }
    // Speiler par-stableford-mønsteret: flight_number = team_number for å
    // oppfylle CHECK-constrainten (begge satt sammen).
    const flight_number = team_number;
    players.push({ user_id, team_number, flight_number });
  }

  if (mode === 'publish') {
    if (players.length < 2) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 2) {
      return { ok: false, errorCode: 'too_many_players_for_mode' };
    }
    // Nøyaktig 2 spillere — sjekk at de er fordelt 1+1 på sidene.
    const sideCounts = new Map<number, number>();
    for (const p of players) {
      if (p.team_number === null) continue;
      sideCounts.set(p.team_number, (sideCounts.get(p.team_number) ?? 0) + 1);
    }
    if (sideCounts.get(1) !== 1 || sideCounts.get(2) !== 1) {
      return { ok: false, errorCode: 'team_balance' };
    }
  }

  return {
    ok: true,
    players,
    mode_config: { kind: 'singles_matchplay', team_size: 1, teams_count: 2 },
  };
}

/**
 * Solo strokeplay netto-validator (epic #46 — klassisk slagspill).
 *
 * Speiler solo-stableford-mønsteret tett: hver spiller er sin egen «row»,
 * ingen lag-tilordning, ingen flight-tilordning. Forskjellen er kun mode_config
 * og selve scoring-modusen i `lib/scoring/`.
 *
 * Regler:
 *  - publish krever ≥1 spiller (samme som solo-stableford — én spiller er nok
 *    så lenge admin har valgt modusen eksplisitt)
 *  - draft tolererer 0 spillere
 *  - duplikat-sjekk uendret
 *  - team_number / flight_number nullstilles alltid, uavhengig av stale
 *    form-inputs (DB-CHECK `game_players_team_flight_consistency` krever
 *    begge satt eller null sammen for solo)
 *
 * Mode_config-output: `{kind, team_size: 1}`.
 *
 * Player-slot-loopen leser opp til 8 slots fra dagens GameForm — kan utvides
 * forbi dette i en senere fase uten skjema-endring (samme begrensning som
 * solo-stableford).
 */
function validateSoloStrokeplayNetto(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) continue;
    if (seen.has(user_id)) {
      return { ok: false, errorCode: 'duplicate_player' };
    }
    seen.add(user_id);
    players.push({ user_id, team_number: null, flight_number: null });
  }

  if (mode === 'publish' && players.length < 1) {
    return { ok: false, errorCode: 'min_players_for_mode' };
  }

  return {
    ok: true,
    players,
    mode_config: { kind: 'solo_strokeplay_netto', team_size: 1 },
  };
}

/**
 * Texas scramble-validator (issue #44).
 *
 * Lagene spiller én ball — én score per lag per hull lagres på lag-kapteinens
 * userId (scoring-laget velger kaptein lex-min). Validatoren håndhever lag-
 * struktur og lag-handicap-prosent ved publish.
 *
 * Form-felter:
 *  - `texas_team_size`: 2 eller 4 (3-mannslag ikke i v1 → unsupported_mode_size_combo)
 *  - `texas_team_handicap_pct`: 0..100 heltall (NGF-default 25 for 2-mannslag,
 *    10 for 4-mannslag, settes av GameForm når lagstørrelse endres). Utenfor
 *    range → bad_allowance (gjenbruker eksisterende kode siden semantikken
 *    er identisk: prosenttall mellom 0 og 100).
 *  - `player_${i}_team`: positivt heltall, ingen øvre grense (par-stableford-
 *    mønsteret — admin kan kjøre stort antall lag for klubb-turnering).
 *
 * Regler ved publish:
 *  - Minst 1 spiller (ellers min_players_for_mode).
 *  - Hvert lag må ha EKSAKT `team_size` spillere (team_balance ved feil).
 *  - Hvert team_number må være ≥1 (bad_team).
 *  - flight_number = team_number per spiller — oppfyller DB-CHECK
 *    `game_players_team_flight_consistency` (begge satt sammen).
 *
 * Draft tolererer partial state (ufullstendige lag, færre enn team_size per
 * lag, 0 spillere). Ugyldig team_size eller team_handicap_pct avvises også
 * i draft siden de er konfig-felt som må være korrekte før noe annet gir
 * mening.
 *
 * Mode_config-output: `{kind, team_size, teams_count, team_handicap_pct}`.
 */
function validateTexasScramble(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const teamSize = parseTexasTeamSize(formData);
  if (teamSize === null) {
    return { ok: false, errorCode: 'unsupported_mode_size_combo' };
  }

  const handicapPct = parseTexasHandicapPct(formData);
  if (handicapPct === null) {
    return { ok: false, errorCode: 'bad_allowance' };
  }

  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) continue;
    if (seen.has(user_id)) {
      return { ok: false, errorCode: 'duplicate_player' };
    }
    seen.add(user_id);
    const team_number = Number(formData.get(`player_${i}_team`));
    if (!Number.isInteger(team_number) || team_number < 1) {
      return { ok: false, errorCode: 'bad_team' };
    }
    // Texas-spillere speiler par-stableford og matchplay: flight = team for
    // å oppfylle DB-CHECK game_players_team_flight_consistency (begge satt).
    players.push({ user_id, team_number, flight_number: team_number });
  }

  if (mode === 'publish') {
    if (players.length === 0) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    const teamCounts = new Map<number, number>();
    for (const p of players) {
      if (p.team_number === null) continue;
      teamCounts.set(p.team_number, (teamCounts.get(p.team_number) ?? 0) + 1);
    }
    for (const [, count] of teamCounts) {
      if (count !== teamSize) {
        return { ok: false, errorCode: 'team_balance' };
      }
    }
  }

  const teams_count = new Set(players.map((p) => p.team_number)).size;

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'texas_scramble',
      team_size: teamSize,
      teams_count,
      team_handicap_pct: handicapPct,
    },
  };
}

/**
 * Leser `texas_team_size` fra form-data. Returnerer 2, 4 eller null. Null =
 * ikke-eksisterende felt, ugyldig verdi, eller 3 (3-mannslag utsatt til v1.1).
 */
function parseTexasTeamSize(formData: FormData): 2 | 4 | null {
  const raw = String(formData.get('texas_team_size') ?? '').trim();
  if (raw === '2') return 2;
  if (raw === '4') return 4;
  return null;
}

/**
 * Leser `texas_team_handicap_pct` fra form-data. Returnerer et heltall i
 * range 0..100 eller null hvis verdien er utenfor range / ikke parseable.
 *
 * Tom string defaulter ikke — admin må eksplisitt sette prosenten via
 * GameForm når Texas-modus er valgt (default settes på lagstørrelse-endring).
 */
function parseTexasHandicapPct(formData: FormData): number | null {
  const raw = formData.get('texas_team_handicap_pct');
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

const modeValidators: Record<
  GameMode,
  (formData: FormData, mode: PayloadMode) => ModeValidationResult
> = {
  best_ball_netto: validateBestBallNetto,
  stableford: validateStableford,
  singles_matchplay: validateSinglesMatchplay,
  solo_strokeplay_netto: validateSoloStrokeplayNetto,
  texas_scramble: validateTexasScramble,
};

/**
 * Parse a "create/edit game" admin form payload.
 *
 * Mode determines how strictly the payload is validated:
 * - 'publish' enforces the full ruleset (course, tee-box, valid mode-specific
 *   player count, allowance in [0, 100]). Used when the game is being
 *   created/edited as a ready-to-play 'scheduled' row.
 * - 'draft' tolerates partial data: empty course/tee-box become `null`, the
 *   player list may have any size (including zero), and no mode-specific
 *   completeness check runs. Duplicate players are still rejected.
 *
 * Modus-spesifikke regler delegeres til `modeValidators[game_mode]`:
 *  - best_ball_netto: 8 spillere fordelt 2-2-2-2 på 4 lag (publish)
 *  - stableford: ≥1 solo spiller, team/flight null (publish)
 *
 * Returns the parsed payload with `errorCode` set on the first failure;
 * callers should redirect with that code as a query param.
 */
export function buildGameInsertPayload(
  formData: FormData,
  mode: PayloadMode,
): ParsedPayload {
  const base = parseBase(formData);

  // Sentinel-payload som returneres ved feil. game_mode/mode_config settes
  // til best-ball-default så typen blir komplett selv ved tidlig retur;
  // errorCode-feltet skal være kallernes eneste signal.
  const errorPayload = (
    errorCode: GameValidationErrorCode,
  ): ParsedPayload => ({
    ...base,
    players: [],
    game_mode: 'best_ball_netto',
    mode_config: { kind: 'best_ball_netto', team_size: 2, teams_count: 4 },
    errorCode,
  });

  if (!base.name) return errorPayload('name_required');

  if (mode === 'publish') {
    if (!base.course_id) return errorPayload('course_required');
    if (!base.tee_box_id) return errorPayload('tee_required');
    if (
      !Number.isInteger(base.hcp_allowance_pct) ||
      base.hcp_allowance_pct < 0 ||
      base.hcp_allowance_pct > 100
    ) {
      return errorPayload('bad_allowance');
    }
  }

  const gameMode = parseGameMode(formData);
  if (gameMode === null) return errorPayload('mode_required');

  const modeResult = modeValidators[gameMode](formData, mode);
  if (!modeResult.ok) {
    return errorPayload(modeResult.errorCode);
  }

  return {
    ...base,
    players: modeResult.players,
    game_mode: gameMode,
    mode_config: modeResult.mode_config,
  };
}
