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
// 'best_ball' hvis det mangler — UI-velgeren introduseres først i
// fase 4. Eksisterende admin-flyt produserer derfor samme payload som før.

import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import {
  gameModeSupportsTeams,
  isRegistrationMode,
  isRegistrationType,
  type RegistrationMode,
  type RegistrationType,
} from './registration';

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
  | 'too_many_players_for_mode'
  // Self-påmeldings-koder (#199):
  // - bad_registration_mode: form sendte en verdi som ikke er en gyldig
  //   registration_mode-enum (invite_only / manual_approval / open).
  // - bad_registration_type: tilsvarende for registration_type (solo / team /
  //   both).
  // - team_registration_unsupported_mode: registration_type team/both valgt
  //   sammen med en game_mode som ikke har lag-konsept (stableford,
  //   singles_matchplay, solo_strokeplay). UI burde forhindre dette,
  //   men server-side gate beskytter mot DevTools-tampering.
  | 'bad_registration_mode'
  | 'bad_registration_type'
  | 'team_registration_unsupported_mode';

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
  /**
   * Påmeldings-modus (#199). Defaulter til 'invite_only' for å speile dagens
   * flyt: admin inviterer eksplisitt, ingen selv-påmelding.
   */
  registration_mode: RegistrationMode;
  /**
   * Type påmelding (#199). Defaulter til 'solo' siden de fleste spillmodi
   * er individuelle; team/both krever at game_mode støtter lag.
   */
  registration_type: RegistrationType;
  errorCode?: GameValidationErrorCode;
};

/** Felles base-felter parset fra FormData, før modus-spesifikk validering. */
type ParsedBase = Omit<
  ParsedPayload,
  | 'players'
  | 'game_mode'
  | 'mode_config'
  | 'registration_mode'
  | 'registration_type'
  | 'errorCode'
>;

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
 * Leser `registration_mode` fra form-data. Defaulter til DB-default
 * 'invite_only' når feltet mangler (bevarer dagens flyt: ingen selv-
 * påmelding). Ugyldig verdi returnerer null så top-level kan flagge
 * `bad_registration_mode`.
 */
function parseRegistrationMode(formData: FormData): RegistrationMode | null {
  const raw = String(formData.get('registration_mode') ?? '').trim();
  if (raw === '') return 'invite_only';
  return isRegistrationMode(raw) ? raw : null;
}

/**
 * Leser `registration_type` fra form-data. Defaulter til 'solo' når
 * feltet mangler. Ugyldig verdi returnerer null så top-level kan flagge
 * `bad_registration_type`.
 */
function parseRegistrationType(formData: FormData): RegistrationType | null {
  const raw = String(formData.get('registration_type') ?? '').trim();
  if (raw === '') return 'solo';
  return isRegistrationType(raw) ? raw : null;
}

/**
 * Leser `game_mode` fra form-data. Defaulter til `best_ball` hvis
 * feltet mangler — bevarer bakoverkompatibilitet inntil ModeSelector
 * (fase 4) wires inn en eksplisitt verdi. Ukjente verdier returnerer
 * null så top-level kan svare med `mode_required`.
 */
function parseGameMode(formData: FormData): GameMode | null {
  const raw = String(formData.get('game_mode') ?? '').trim();
  if (raw === '') return 'best_ball';
  if (
    raw === 'best_ball' ||
    raw === 'stableford' ||
    raw === 'modified_stableford' ||
    raw === 'singles_matchplay' ||
    raw === 'solo_strokeplay' ||
    raw === 'texas_scramble' ||
    raw === 'fourball_matchplay' ||
    raw === 'foursomes_matchplay' ||
    raw === 'wolf' ||
    raw === 'nassau' ||
    raw === 'skins'
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
function validateBestBall(
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
    mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
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
    return validateStablefordTeam(formData, mode, 'stableford');
  }
  return validateStablefordSolo(formData, mode, 'stableford');
}

/**
 * Modified stableford (#281). Identisk spiller-parsing og lag-regler som
 * standard Stableford — eneste forskjellen er `mode_config.kind` /
 * `points_table` (pro-tabellen velges i scoring-laget). Gjenbruker derfor
 * solo-/team-validatorene med `'modified_stableford'`-varianten og samme
 * `stableford_team_size`-form-felt.
 */
function validateModifiedStableford(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const teamSize = parseStablefordTeamSize(formData);
  if (teamSize === 2) {
    return validateStablefordTeam(formData, mode, 'modified_stableford');
  }
  return validateStablefordSolo(formData, mode, 'modified_stableford');
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
  variant: 'stableford' | 'modified_stableford' = 'stableford',
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
    mode_config:
      variant === 'modified_stableford'
        ? { kind: 'modified_stableford', team_size: 1, points_table: 'modified' }
        : { kind: 'stableford', team_size: 1, points_table: 'standard' },
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
  variant: 'stableford' | 'modified_stableford' = 'stableford',
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
    mode_config:
      variant === 'modified_stableford'
        ? { kind: 'modified_stableford', team_size: 2, points_table: 'modified' }
        : { kind: 'stableford', team_size: 2, points_table: 'standard' },
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
 * Solo strokeplay-validator (epic #46 — klassisk slagspill).
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
function validateSoloStrokeplay(
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
    mode_config: { kind: 'solo_strokeplay', team_size: 1 },
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

/**
 * Four-ball matchplay-validator (issue #217, fase 2 av #47 — 2v2 best-ball-matchplay).
 *
 * Regler:
 *  - hver spiller MÅ ha team_number = 1 eller 2 (sideNumber for matchplay)
 *  - publish krever EKSAKT 4 spillere fordelt 2 på side 1 og 2 på side 2
 *  - flight_number = team_number (samme pattern som singles_matchplay og
 *    par-stableford for å oppfylle DB-CHECK `game_players_team_flight_consistency`
 *    som krever begge satt eller null sammen)
 *  - duplikat-sjekk uendret
 *  - draft tolererer partial state (0..4 spillere, side-tilordning trenger
 *    ikke være balansert)
 *
 * Feilkoder ved publish:
 *  - 0..3 spillere → `min_players_for_mode`
 *  - 5+ spillere → `too_many_players_for_mode`
 *  - 4 spillere men ikke 2-2-fordeling → `team_balance`
 *
 * Allowance: leses fra form-feltet `fourball_allowance_pct` (0..100). Tom/
 * ugyldig verdi defaulter til 100 i draft for å tolerere partial state; ved
 * publish håndhever validatoren range (0..100). Wizard pre-fyller verdien fra
 * `tournaments.fourball_allowance_pct` for cup-matches.
 *
 * Mode_config-output: `{kind, team_size: 2, teams_count: 2, allowance_pct}`.
 */
function validateFourballMatchplay(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const allowancePct = parseFourballAllowancePct(formData, mode);
  if (allowancePct === null) {
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
    // Fourball-sider er strengt 1 eller 2 (speiler singles_matchplay-mønsteret).
    if (
      !Number.isInteger(team_number) ||
      team_number < 1 ||
      team_number > 2
    ) {
      return { ok: false, errorCode: 'bad_team' };
    }
    // flight_number = team_number for å oppfylle DB-CHECK
    // game_players_team_flight_consistency (begge satt sammen).
    const flight_number = team_number;
    players.push({ user_id, team_number, flight_number });
  }

  if (mode === 'publish') {
    if (players.length < 4) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 4) {
      return { ok: false, errorCode: 'too_many_players_for_mode' };
    }
    // Nøyaktig 4 spillere — sjekk 2-2-fordeling på sidene.
    const sideCounts = new Map<number, number>();
    for (const p of players) {
      if (p.team_number === null) continue;
      sideCounts.set(p.team_number, (sideCounts.get(p.team_number) ?? 0) + 1);
    }
    if (sideCounts.get(1) !== 2 || sideCounts.get(2) !== 2) {
      return { ok: false, errorCode: 'team_balance' };
    }
  }

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'fourball_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: allowancePct,
    },
  };
}

/**
 * Leser `fourball_allowance_pct` fra form-data. Returnerer 0..100 (heltall)
 * eller null hvis ugyldig.
 *
 * Tom string i draft defaulter til 100 så partial form-state ikke kaster;
 * publish krever eksplisitt gyldig verdi. Range 0..100 håndheves uansett —
 * verdier utenfor (NaN, negative, >100) returnerer null → bad_allowance.
 */
function parseFourballAllowancePct(
  formData: FormData,
  mode: PayloadMode,
): number | null {
  const raw = formData.get('fourball_allowance_pct');
  if (raw === null || raw === '') {
    // Draft: defensiv default. Publish: krev eksplisitt verdi via wizard
    // (som alltid pre-fyller fra cup eller setter 85 som fallback).
    return mode === 'draft' ? 100 : null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Foursomes matchplay-validator (issue #218 — 2v2 alternate-shot).
 *
 * Speiler `validateFourballMatchplay` strukturelt — begge er 2v2 matchplay
 * der hver spiller mappes til side 1 eller 2. Forskjellen er scoring-laget
 * (foursomes spiller én ball per lag via kaptein-pattern; fourball har
 * egen ball per spiller). Validatoren ser samme spiller-form ut.
 *
 * Regler:
 *  - hver spiller MÅ ha team_number = 1 eller 2
 *  - publish krever EKSAKT 4 spillere fordelt 2 på side 1 og 2 på side 2
 *  - flight_number = team_number (DB-CHECK `game_players_team_flight_consistency`)
 *  - duplikat-sjekk uendret
 *  - draft tolererer partial state
 *
 * Allowance: leses fra form-feltet `foursomes_allowance_pct` (0..100).
 * Default 50 (WHS-standard) settes av wizarden ved pre-fill fra
 * `tournaments.foursomes_allowance_pct`; scoring-laget bruker
 * diff-basert formel (round(|combined_diff| × pct/100) → strokes til
 * high side via SI).
 *
 * Mode_config-output: `{kind, team_size: 2, teams_count: 2, allowance_pct}`.
 */
function validateFoursomesMatchplay(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const allowancePct = parseFoursomesAllowancePct(formData, mode);
  if (allowancePct === null) {
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
    // Foursomes-sider er strengt 1 eller 2 (speiler fourball/singles).
    if (
      !Number.isInteger(team_number) ||
      team_number < 1 ||
      team_number > 2
    ) {
      return { ok: false, errorCode: 'bad_team' };
    }
    const flight_number = team_number;
    players.push({ user_id, team_number, flight_number });
  }

  if (mode === 'publish') {
    if (players.length < 4) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 4) {
      return { ok: false, errorCode: 'too_many_players_for_mode' };
    }
    // Nøyaktig 4 spillere — sjekk 2-2-fordeling på sidene.
    const sideCounts = new Map<number, number>();
    for (const p of players) {
      if (p.team_number === null) continue;
      sideCounts.set(p.team_number, (sideCounts.get(p.team_number) ?? 0) + 1);
    }
    if (sideCounts.get(1) !== 2 || sideCounts.get(2) !== 2) {
      return { ok: false, errorCode: 'team_balance' };
    }
  }

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'foursomes_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: allowancePct,
    },
  };
}

/**
 * Leser `foursomes_allowance_pct` fra form-data. Returnerer 0..100 (heltall)
 * eller null hvis ugyldig.
 *
 * Tom string i draft defaulter til 50 (WHS-standard) så partial form-state
 * ikke kaster; publish krever eksplisitt gyldig verdi (wizarden pre-fyller
 * fra cup eller setter 50 som fallback). Range 0..100 håndheves uansett.
 */
function parseFoursomesAllowancePct(
  formData: FormData,
  mode: PayloadMode,
): number | null {
  const raw = formData.get('foursomes_allowance_pct');
  if (raw === null || raw === '') {
    return mode === 'draft' ? 50 : null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Wolf-validator (issue #274 — 4-spiller rotating partner-format).
 *
 * Regler:
 *  - EKSAKT 4 spillere ved publish
 *  - team_number 1-4, alle distinct (representerer rotation-slot, ikke lag)
 *  - flight_number = team_number (DB-CHECK game_players_team_flight_consistency)
 *  - draft tolererer partial state (0..4 spillere, ufullstendig slot-fordeling)
 *
 * Feilkoder ved publish:
 *  - 0..3 spillere → `min_players_for_mode`
 *  - 5+ spillere → `too_many_players_for_mode`
 *  - 4 spillere men ikke unike team_numbers 1-4 → `team_balance`
 *
 * Scoring-toggle: form-feltet `wolf_scoring` ('gross' | 'net'). Default 'net'
 * når feltet mangler (matcher Tørny-default + design-doc).
 *
 * Mode_config-output: `{kind, team_size: 1, teams_count: 4, wolf_scoring}`.
 */
function validateWolf(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const wolfScoring = parseWolfScoring(formData);

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
    // Wolf-slot er strengt 1-4 (rotation-slot, ikke lag).
    if (
      !Number.isInteger(team_number) ||
      team_number < 1 ||
      team_number > 4
    ) {
      return { ok: false, errorCode: 'bad_team' };
    }
    const flight_number = team_number;
    players.push({ user_id, team_number, flight_number });
  }

  if (mode === 'publish') {
    if (players.length < 4) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 4) {
      return { ok: false, errorCode: 'too_many_players_for_mode' };
    }
    // Nøyaktig 4 spillere — sjekk at team_numbers er unike 1-4.
    const slotsSeen = new Set<number>();
    for (const p of players) {
      if (p.team_number === null) continue;
      slotsSeen.add(p.team_number);
    }
    if (slotsSeen.size !== 4) {
      return { ok: false, errorCode: 'team_balance' };
    }
  }

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'wolf',
      team_size: 1,
      teams_count: 4,
      wolf_scoring: wolfScoring,
    },
  };
}

/**
 * Leser `wolf_scoring` fra form-data. Defaulter til 'net' når feltet mangler
 * eller har en ugyldig verdi — speiler Tørny's HCP-default-ethos.
 */
function parseWolfScoring(formData: FormData): 'gross' | 'net' {
  const raw = String(formData.get('wolf_scoring') ?? '').trim();
  if (raw === 'gross') return 'gross';
  return 'net';
}

/**
 * Nassau-validator (issue #276 — front 9 + back 9 + total 18).
 *
 * Regler:
 *  - 2-4 spillere ved publish
 *  - Solo-format: team_number/flight_number nullstilles (samme som
 *    solo_strokeplay) — DB-CHECK game_players_team_flight_consistency
 *    krever begge satt sammen eller begge null
 *  - draft tolererer partial state (0..4 spillere)
 *
 * Feilkoder ved publish:
 *  - 0..1 spillere → `min_players_for_mode`
 *  - 5+ spillere → `too_many_players_for_mode`
 *
 * Scoring-toggle: form-feltet `nassau_scoring` ('gross' | 'net'). Default 'net'
 * når feltet mangler (matcher Tørny-default + Wolf-mønstret).
 *
 * Mode_config-output: `{kind, team_size: 1, nassau_scoring}`.
 */
function validateNassau(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const nassauScoring = parseNassauScoring(formData);

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

  if (mode === 'publish') {
    if (players.length < 2) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 4) {
      return { ok: false, errorCode: 'too_many_players_for_mode' };
    }
  }

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'nassau',
      team_size: 1,
      nassau_scoring: nassauScoring,
    },
  };
}

/**
 * Leser `nassau_scoring` fra form-data. Defaulter til 'net' når feltet mangler
 * eller har en ugyldig verdi — speiler Wolf-mønstret + Tørny's HCP-default.
 */
function parseNassauScoring(formData: FormData): 'gross' | 'net' {
  const raw = String(formData.get('nassau_scoring') ?? '').trim();
  if (raw === 'gross') return 'gross';
  return 'net';
}

/**
 * Skins-validator (issue #275 — skins med carryover).
 *
 * Speiler `validateNassau`: solo-format, 2-4 spillere ved publish, ingen
 * duplikater, team_number/flight_number nullstilles. Carryover er ren funksjon
 * av scores, så ingen ekstra felt å validere.
 *
 * Scoring-toggle: form-feltet `skins_scoring` ('gross' | 'net'). Default 'net'
 * når feltet mangler (matcher Tørny-default + Wolf/Nassau-mønstret).
 * `games.hcp_allowance_pct` brukes IKKE — enten full HCP eller ingen.
 *
 * Mode_config-output: `{kind, team_size: 1, skins_scoring}`.
 */
function validateSkins(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const skinsScoring = parseSkinsScoring(formData);

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

  if (mode === 'publish') {
    if (players.length < 2) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 4) {
      return { ok: false, errorCode: 'too_many_players_for_mode' };
    }
  }

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'skins',
      team_size: 1,
      skins_scoring: skinsScoring,
    },
  };
}

/**
 * Leser `skins_scoring` fra form-data. Defaulter til 'net' når feltet mangler
 * eller har en ugyldig verdi — speiler Nassau/Wolf-mønstret + Tørny's
 * HCP-default.
 */
function parseSkinsScoring(formData: FormData): 'gross' | 'net' {
  const raw = String(formData.get('skins_scoring') ?? '').trim();
  if (raw === 'gross') return 'gross';
  return 'net';
}

const modeValidators: Record<
  GameMode,
  (formData: FormData, mode: PayloadMode) => ModeValidationResult
> = {
  best_ball: validateBestBall,
  stableford: validateStableford,
  modified_stableford: validateModifiedStableford,
  singles_matchplay: validateSinglesMatchplay,
  solo_strokeplay: validateSoloStrokeplay,
  texas_scramble: validateTexasScramble,
  fourball_matchplay: validateFourballMatchplay,
  foursomes_matchplay: validateFoursomesMatchplay,
  wolf: validateWolf,
  nassau: validateNassau,
  skins: validateSkins,
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
 *  - best_ball: 8 spillere fordelt 2-2-2-2 på 4 lag (publish)
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
    game_mode: 'best_ball',
    mode_config: { kind: 'best_ball', team_size: 2, teams_count: 4 },
    registration_mode: 'invite_only',
    registration_type: 'solo',
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

  // Self-påmelding (#199): registration_mode + registration_type. Defaultes
  // i parser-en til ('invite_only', 'solo') når feltene mangler så dagens
  // payload-skjema er bakoverkompatibelt. Cross-field-validering håndhever
  // at team/both kun er gyldig med en game_mode som har lag-konsept —
  // server-side gate beskytter mot DevTools-tampering når UI ellers
  // disabler radio-knappene.
  const registrationMode = parseRegistrationMode(formData);
  if (registrationMode === null) return errorPayload('bad_registration_mode');

  const registrationType = parseRegistrationType(formData);
  if (registrationType === null) return errorPayload('bad_registration_type');

  if (
    (registrationType === 'team' || registrationType === 'both') &&
    !gameModeSupportsTeams(gameMode)
  ) {
    return errorPayload('team_registration_unsupported_mode');
  }

  // For self-påmeldings-modi (open / manual_approval) er spiller-listen
  // valgfri ved publish — spillerne kan komme via lenken etterpå. Vi
  // sender derfor 'draft' inn til mode-validatoren slik at completeness-
  // sjekkene (eksakt 8 spillere på best-ball, balansert lag-fordeling osv.)
  // hoppes over. Duplikat-sjekk og bad-team/bad-flight håndheves fortsatt
  // siden de gjelder enhver innsendt rad.
  const effectiveMode: PayloadMode =
    mode === 'publish' && registrationMode !== 'invite_only' ? 'draft' : mode;
  const modeResult = modeValidators[gameMode](formData, effectiveMode);
  if (!modeResult.ok) {
    return errorPayload(modeResult.errorCode);
  }

  return {
    ...base,
    players: modeResult.players,
    game_mode: gameMode,
    mode_config: modeResult.mode_config,
    registration_mode: registrationMode,
    registration_type: registrationType,
  };
}
