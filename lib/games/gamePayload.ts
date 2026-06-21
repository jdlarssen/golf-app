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

/**
 * Inverse of `parseOsloDateTimeLocal`: format a UTC ISO timestamp as a
 * `YYYY-MM-DDTHH:mm` wall-clock string in Europe/Oslo, suitable as the
 * `defaultValue` of an `<input type="datetime-local">`. Round-trips with
 * `parseOsloDateTimeLocal` for any minute-aligned instant (parse∘format and
 * format∘parse are both the identity outside the ambiguous fall-back hour).
 *
 * Throws RangeError on an unparseable ISO string.
 */
export function formatOsloDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`Invalid ISO timestamp: ${iso}`);
  }
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // Intl may render midnight as '24' on some engines — normalise to '00'.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
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
  /**
   * #369: «Slipp venner direkte inn». Kun persistert som true når
   * registration_mode = 'manual_approval'; force-false ellers.
   */
  let_friends_skip_gate: boolean;
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
  | 'let_friends_skip_gate'
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
    raw === 'ambrose' ||
    raw === 'florida_scramble' ||
    raw === 'fourball_matchplay' ||
    raw === 'foursomes_matchplay' ||
    raw === 'greensome_matchplay' ||
    raw === 'chapman_matchplay' ||
    raw === 'wolf' ||
    raw === 'nassau' ||
    raw === 'skins' ||
    raw === 'bingo_bango_bongo' ||
    raw === 'nines' ||
    raw === 'round_robin' ||
    raw === 'acey_deucey' ||
    raw === 'shamble' ||
    raw === 'patsome' ||
    raw === 'gruesome_matchplay'
  )
    return raw;
  return null;
}

/**
 * Leser en `<mode>_scoring`-toggle fra form-data. Defaulter til 'net' når feltet
 * mangler eller har en ugyldig verdi — speiler Tørny's HCP-default-ethos. Delt
 * helper for de score-baserte solo-formatene (wolf/nassau/skins/acey_deucey/
 * nines/shamble/patsome), som alle leser samme 'gross'|'net'-felt.
 */
function parseScoringToggle(
  formData: FormData,
  formKey: string,
): 'gross' | 'net' {
  const raw = String(formData.get(formKey) ?? '').trim();
  if (raw === 'gross') return 'gross';
  return 'net';
}

/**
 * Leser solo-format-spillere fra `player_${i}_id`-slots (0..slotCount-1) og
 * nullstiller team_number/flight_number — DB-CHECK
 * `game_players_team_flight_consistency` krever begge satt sammen eller begge
 * null. Delt helper for de null-team solo-validatorene hvis loop-kropp er
 * byte-identisk; slot-count varierer (8 vs 17) og er derfor en parameter.
 *
 * Returnerer `{ ok: true, players }` eller `{ ok: false, errorCode:
 * 'duplicate_player' }` ved første duplikat — call-site eier alle videre
 * publish-/cap-/team-sjekker.
 */
function parseSoloPlayers(
  formData: FormData,
  slotCount: number,
):
  | { ok: true; players: GamePlayerInput[] }
  | { ok: false; errorCode: 'duplicate_player' } {
  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < slotCount; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) continue;
    if (seen.has(user_id)) {
      return { ok: false, errorCode: 'duplicate_player' };
    }
    seen.add(user_id);
    players.push({ user_id, team_number: null, flight_number: null });
  }
  return { ok: true, players };
}

/**
 * Sjekker at hvert ikke-tomt lag har EKSAKT `requiredSize` spillere. Returnerer
 * `'team_balance'` ved første lag i ubalanse, ellers `null`. Delt helper for
 * lag-formatene som teller per team_number og krever en fast lagstørrelse
 * (best-ball/par-stableford = 2; texas/ambrose/florida/shamble = team_size;
 * patsome = 2). Ekskluderer 2v2-matchplay-validatorene (foursomes-familien),
 * som bruker en distinkt side-1/side-2-sjekk.
 */
function validateTeamBalance(
  players: GamePlayerInput[],
  requiredSize: number,
): 'team_balance' | null {
  const teamCounts = new Map<number, number>();
  for (const p of players) {
    if (p.team_number === null) continue;
    teamCounts.set(p.team_number, (teamCounts.get(p.team_number) ?? 0) + 1);
  }
  for (const [, count] of teamCounts) {
    if (count !== requiredSize) {
      return 'team_balance';
    }
  }
  return null;
}

/**
 * Best-ball-netto-validator. Fleksibel lagstørrelse (#374):
 *  - publish krever ≥1 lag à 2 spillere (2, 4, 6 eller 8 spillere),
 *    hvert ikke-tomt lag har EKSAKT 2 spillere — speiler validateStablefordTeam
 *  - draft tillater partial state (0..8 spillere), men team/flight rangen
 *    blir likevel validert per ikke-tom rad
 *  - duplikat-sjekk gjelder begge moduser
 *  - UI-gitteret har 4 lag (team_number 1..4); tomme lag er lov ved publish
 *
 * Mode_config-output: `{kind, team_size: 2, teams_count: <faktisk antall lag>}`.
 */
function validateBestBall(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) continue; // hopp over tomme slots i begge moduser
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
    if (players.length === 0) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    const teamCounts = new Map<number, number>();
    for (const p of players) {
      if (p.team_number === null) continue;
      teamCounts.set(p.team_number, (teamCounts.get(p.team_number) ?? 0) + 1);
    }
    // Hvert ikke-tomt lag må ha EKSAKT 2 spillere
    for (const [, count] of teamCounts) {
      if (count !== 2) {
        return { ok: false, errorCode: 'team_balance' };
      }
    }
  }

  const teams_count = new Set(players.map((p) => p.team_number)).size;
  return {
    ok: true,
    players,
    mode_config: { kind: 'best_ball', team_size: 2, teams_count },
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
  const playersResult = parseSoloPlayers(formData, 8);
  if (!playersResult.ok) {
    return playersResult;
  }
  const players = playersResult.players;

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
  const playersResult = parseSoloPlayers(formData, 8);
  if (!playersResult.ok) {
    return playersResult;
  }
  const players = playersResult.players;

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
 * Ambrose-validator (issue #284). Mekanisk identisk med Texas scramble — lagene
 * spiller én ball, kapteinen (lex-min userId) eier scores-radene — men med egen
 * config-kind og standard Ambrose-default-handicap (`combinedCH ÷ 2×team_size`,
 * satt av wizarden via `ambroseDefaultPct`). `team_handicap_pct` er justerbar og
 * kan være fraksjonell (4-mannslag-default = 12,5 %), i motsetning til Texas'
 * heltall-felt.
 *
 * Form-felter:
 *  - `ambrose_team_size`: 2 eller 4 (3-mannslag ikke i scope → unsupported_mode_size_combo)
 *  - `ambrose_team_handicap_pct`: 0..100, fraksjonell tillatt (utenfor range → bad_allowance)
 *  - `player_${i}_team`: positivt heltall, fri antall lag (klubb-turnering)
 *
 * Regler ved publish: minst 1 spiller, EKSAKT team_size per lag (team_balance),
 * team_number ≥ 1 (bad_team). flight_number = team_number oppfyller DB-CHECK
 * `game_players_team_flight_consistency`. Draft tolererer partial state.
 * Mode_config-output: `{kind: 'ambrose', team_size, teams_count, team_handicap_pct}`.
 */
function validateAmbrose(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const teamSize = parseAmbroseTeamSize(formData);
  if (teamSize === null) {
    return { ok: false, errorCode: 'unsupported_mode_size_combo' };
  }

  const handicapPct = parseAmbroseHandicapPct(formData);
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
    // Ambrose speiler Texas: flight = team for å oppfylle DB-CHECK
    // game_players_team_flight_consistency (begge satt).
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
      kind: 'ambrose',
      team_size: teamSize,
      teams_count,
      team_handicap_pct: handicapPct,
    },
  };
}

/**
 * Leser `ambrose_team_size` fra form-data. Returnerer 2, 4 eller null (3-mannslag
 * ikke i scope — speiler Texas).
 */
function parseAmbroseTeamSize(formData: FormData): 2 | 4 | null {
  const raw = String(formData.get('ambrose_team_size') ?? '').trim();
  if (raw === '2') return 2;
  if (raw === '4') return 4;
  return null;
}

/**
 * Leser `ambrose_team_handicap_pct` fra form-data. Returnerer et tall i range
 * 0..100 (fraksjonell TILLATT, i motsetning til Texas' heltall-krav) eller null
 * hvis utenfor range / ikke parseable. Standard Ambrose 4-mannslag-default er
 * 12,5 %, derfor må fraksjonelle verdier passere.
 *
 * Tom string defaulter ikke — wizarden setter prosenten eksplisitt på
 * lagstørrelse-endring (via `ambroseDefaultPct`).
 */
function parseAmbroseHandicapPct(formData: FormData): number | null {
  const raw = formData.get('ambrose_team_handicap_pct');
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Florida Scramble-validator (issue #283). Mekanisk identisk med Ambrose-
 * validatoren — lagene spiller én ball, kapteinen (lex-min userId) eier
 * scores-radene — men med:
 *  - Lagstørrelser: 3 eller 4 (ikke 2; 2-mannslag → unsupported_mode_size_combo)
 *  - NGF-default-handicap: 15 % for 3-mann, 10 % for 4-mann (fasttabell, ikke
 *    formel som Ambrose). Settes av wizarden via `defaultFloridaHandicapPct`.
 *
 * Form-felter:
 *  - `florida_team_size`: 3 eller 4
 *  - `florida_team_handicap_pct`: 0..100, fraksjonell tillatt
 *  - `player_${i}_team`: positivt heltall, fri antall lag
 *
 * Regler ved publish: minst 1 spiller, EKSAKT team_size per lag (team_balance),
 * team_number ≥ 1 (bad_team). flight_number = team_number oppfyller DB-CHECK.
 * Mode_config-output: `{kind: 'florida_scramble', team_size, teams_count, team_handicap_pct}`.
 */
function validateFloridaScramble(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const teamSize = parseFloridaTeamSize(formData);
  if (teamSize === null) {
    return { ok: false, errorCode: 'unsupported_mode_size_combo' };
  }

  const handicapPct = parseFloridaHandicapPct(formData);
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
    // Florida speiler Texas: flight = team for å oppfylle DB-CHECK
    // game_players_team_flight_consistency (begge satt).
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
      kind: 'florida_scramble',
      team_size: teamSize,
      teams_count,
      team_handicap_pct: handicapPct,
    },
  };
}

/**
 * Leser `florida_team_size` fra form-data. Returnerer 3 eller 4, eller null.
 * 2-mannslag støttes ikke (→ unsupported_mode_size_combo).
 */
function parseFloridaTeamSize(formData: FormData): 3 | 4 | null {
  const raw = String(formData.get('florida_team_size') ?? '').trim();
  if (raw === '3') return 3;
  if (raw === '4') return 4;
  return null;
}

/**
 * Leser `florida_team_handicap_pct` fra form-data. Returnerer et tall i range
 * 0..100 (fraksjonell tillatt) eller null. Wizarden setter prosenten via
 * `defaultFloridaHandicapPct` (15 % for 3-mann, 10 % for 4-mann).
 */
function parseFloridaHandicapPct(formData: FormData): number | null {
  const raw = formData.get('florida_team_handicap_pct');
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
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
 * Greensome matchplay-validator (issue #289 — 2v2 velg-beste-tee + alternate).
 *
 * Speiler `validateFoursomesMatchplay` 1:1 — eneste reelle forskjell er at
 * allowance leses fra `greensome_allowance_pct` (WHS-default 100) og
 * mode_config.kind = 'greensome_matchplay'. Lag-handicap-formelen (0,6/0,4)
 * håndheves i scoring-modulen, ikke validatoren.
 *
 * Regler:
 *  - EKSAKT 4 spillere fordelt 2-2 på side 1 og 2 ved publish
 *  - team_number strengt 1 eller 2, flight_number = team_number
 *  - draft tolererer partial state
 *
 * Feilkoder ved publish:
 *  - ≤3 spillere → `min_players_for_mode`
 *  - ≥5 spillere → `too_many_players_for_mode`
 *  - 4 spillere men ikke 2-2 → `team_balance`
 *  - ugyldig allowance → `bad_allowance`
 *
 * Mode_config-output: `{kind: 'greensome_matchplay', team_size: 2, teams_count: 2, allowance_pct}`.
 */
function validateGreensomeMatchplay(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const allowancePct = parseGreensomeAllowancePct(formData, mode);
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
    // Greensome-sider er strengt 1 eller 2 (speiler foursomes/fourball/singles).
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
      kind: 'greensome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: allowancePct,
    },
  };
}

/**
 * Leser `greensome_allowance_pct` fra form-data. Returnerer 0..100 (heltall)
 * eller null hvis ugyldig.
 *
 * Tom string i draft defaulter til 100 (WHS-standard for greensome) så partial
 * form-state ikke kaster; publish krever eksplisitt gyldig verdi (wizarden
 * pre-fyller fra cup eller setter 100 som fallback). Range 0..100 håndheves uansett.
 */
function parseGreensomeAllowancePct(
  formData: FormData,
  mode: PayloadMode,
): number | null {
  const raw = formData.get('greensome_allowance_pct');
  if (raw === null || raw === '') {
    return mode === 'draft' ? 100 : null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Chapman-matchplay-validator (issue #290). Mekanisk identisk med greensome/
 * foursomes (2v2 alternate shot, eksakt 2+2 ved publish, flight = team), eneste
 * forskjell er allowance-feltet (`chapman_allowance_pct`, default 100) og
 * config-`kind`. Lag-handicap (60/40, samme som greensome) håndheves i
 * scoring-modulen, ikke validatoren.
 *
 * Mode_config-output: `{kind: 'chapman_matchplay', team_size: 2, teams_count: 2,
 * allowance_pct}`.
 */
function validateChapmanMatchplay(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const allowancePct = parseChapmanAllowancePct(formData, mode);
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
    // Chapman-sider er strengt 1 eller 2 (speiler foursomes/greensome).
    if (!Number.isInteger(team_number) || team_number < 1 || team_number > 2) {
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
      kind: 'chapman_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: allowancePct,
    },
  };
}

/**
 * Leser `chapman_allowance_pct` fra form-data. Returnerer 0..100 (heltall)
 * eller null hvis ugyldig. Tom string i draft defaulter til 100 (WHS Chapman
 * matchplay-standard — full diff etter 60/40-reduksjonen); publish krever
 * eksplisitt gyldig verdi. Range 0..100 håndheves uansett.
 */
function parseChapmanAllowancePct(
  formData: FormData,
  mode: PayloadMode,
): number | null {
  const raw = formData.get('chapman_allowance_pct');
  if (raw === null || raw === '') {
    return mode === 'draft' ? 100 : null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Gruesome matchplay-validator (issue #291 — 2v2 motstander-velger-tee + alternate).
 *
 * Speiler `validateChapmanMatchplay` 1:1 — eneste reelle forskjell er at
 * allowance leses fra `gruesome_allowance_pct` (WHS-default 50, identisk med
 * foursomes) og mode_config.kind = 'gruesome_matchplay'. Lag-handicap-formelen
 * (sum, som foursomes) håndheves i scoring-modulen, ikke validatoren.
 *
 * Regler:
 *  - EKSAKT 4 spillere fordelt 2-2 på side 1 og 2 ved publish
 *  - team_number strengt 1 eller 2, flight_number = team_number
 *  - draft tolererer partial state
 *
 * Feilkoder ved publish:
 *  - ≤3 spillere → `min_players_for_mode`
 *  - ≥5 spillere → `too_many_players_for_mode`
 *  - 4 spillere men ikke 2-2 → `team_balance`
 *  - ugyldig allowance → `bad_allowance`
 *
 * Mode_config-output: `{kind: 'gruesome_matchplay', team_size: 2, teams_count: 2, allowance_pct}`.
 */
function validateGruesomeMatchplay(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const allowancePct = parseGruesomeAllowancePct(formData, mode);
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
    // Gruesome-sider er strengt 1 eller 2 (speiler foursomes/greensome/chapman).
    if (!Number.isInteger(team_number) || team_number < 1 || team_number > 2) {
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
      kind: 'gruesome_matchplay',
      team_size: 2,
      teams_count: 2,
      allowance_pct: allowancePct,
    },
  };
}

/**
 * Leser `gruesome_allowance_pct` fra form-data. Returnerer 0..100 (heltall)
 * eller null hvis ugyldig. Tom string i draft defaulter til 50 (WHS foursomes-
 * standard — gruesome bruker sum-handicap, identisk med foursomes); publish
 * krever eksplisitt gyldig verdi. Range 0..100 håndheves uansett.
 */
function parseGruesomeAllowancePct(
  formData: FormData,
  mode: PayloadMode,
): number | null {
  const raw = formData.get('gruesome_allowance_pct');
  if (raw === null || raw === '') {
    return mode === 'draft' ? 50 : null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Wolf-validator (issue #274; #465 — 3–5-spiller rotating partner-format).
 *
 * Regler:
 *  - 3-5 spillere ved publish (n = antall spillere)
 *  - team_number sammenhengende 1..n, alle distinct (rotation-slot, ikke lag)
 *  - flight_number = team_number (DB-CHECK game_players_team_flight_consistency)
 *  - draft tolererer partial state (0..5 spillere, ufullstendig slot-fordeling)
 *
 * Feilkoder ved publish:
 *  - 0..2 spillere → `min_players_for_mode`
 *  - 6+ spillere → `too_many_players_for_mode`
 *  - team_number utenfor 1-5 → `bad_team`
 *  - team_numbers ikke sammenhengende 1..n → `team_balance`
 *
 * Scoring-toggle: form-feltet `wolf_scoring` ('gross' | 'net'). Default 'net'
 * når feltet mangler (matcher Tørny-default + design-doc).
 *
 * Mode_config-output: `{kind, team_size: 1, teams_count: n, wolf_scoring}`.
 */
function validateWolf(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const wolfScoring = parseScoringToggle(formData, 'wolf_scoring');

  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  // #465: les opptil 6 slots (én over 5-cap) så en 6. spiller fanges som
  // `too_many` i stedet for å trunkeres stille.
  for (let i = 0; i < 6; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) continue;
    if (seen.has(user_id)) {
      return { ok: false, errorCode: 'duplicate_player' };
    }
    seen.add(user_id);
    const team_number = Number(formData.get(`player_${i}_team`));
    // Wolf-slot er en rotation-slot 1-5 (n bestemmes av antall spillere).
    if (
      !Number.isInteger(team_number) ||
      team_number < 1 ||
      team_number > 5
    ) {
      return { ok: false, errorCode: 'bad_team' };
    }
    const flight_number = team_number;
    players.push({ user_id, team_number, flight_number });
  }

  if (mode === 'publish') {
    if (players.length < 3) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 5) {
      return { ok: false, errorCode: 'too_many_players_for_mode' };
    }
    // 3-5 spillere — team_numbers må være sammenhengende 1..n så rotasjonen
    // (slot = ((hull-1) % n) + 1) finner en wolf på hvert hull.
    const sorted = players
      .map((p) => p.team_number ?? 0)
      .sort((a, b) => a - b);
    const contiguous = sorted.every((tn, idx) => tn === idx + 1);
    if (!contiguous) {
      return { ok: false, errorCode: 'team_balance' };
    }
  }

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'wolf',
      team_size: 1,
      teams_count: players.length,
      wolf_scoring: wolfScoring,
    },
  };
}

/**
 * Nassau-validator (issue #276 — front 9 + back 9 + total 18).
 *
 * Regler:
 *  - 2-16 spillere ved publish (#460 — hevet fra 4)
 *  - Solo-format: team_number/flight_number nullstilles (samme som
 *    solo_strokeplay) — DB-CHECK game_players_team_flight_consistency
 *    krever begge satt sammen eller begge null
 *  - draft tolererer partial state (0..16 spillere)
 *
 * Feilkoder ved publish:
 *  - 0..1 spillere → `min_players_for_mode`
 *  - 17+ spillere → `too_many_players_for_mode`
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
  const nassauScoring = parseScoringToggle(formData, 'nassau_scoring');

  // #460: les opptil 17 slots — én over 16-cap-en, så en 17. spiller fanges
  // av cap-sjekken under i stedet for å trunkeres stille til 16.
  const playersResult = parseSoloPlayers(formData, 17);
  if (!playersResult.ok) {
    return playersResult;
  }
  const players = playersResult.players;

  if (mode === 'publish') {
    if (players.length < 2) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 16) {
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
 * Skins-validator (issue #275 — skins med carryover).
 *
 * Speiler `validateNassau`: solo-format, 2-16 spillere ved publish (#460), ingen
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
  const skinsScoring = parseScoringToggle(formData, 'skins_scoring');

  // #460: les opptil 17 slots — én over 16-cap-en, så en 17. spiller fanges
  // av cap-sjekken under i stedet for å trunkeres stille til 16.
  const playersResult = parseSoloPlayers(formData, 17);
  if (!playersResult.ok) {
    return playersResult;
  }
  const players = playersResult.players;

  if (mode === 'publish') {
    if (players.length < 2) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 16) {
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
 * Acey Deucey-validator (issue #279 — 4-spiller per-hull point-game).
 *
 * Speiler `validateSkins`/`validateNassau` for scoring-toggle; speiler
 * `validateWolf` for eksakt-4-player-håndhevingen.
 *
 * Regler:
 *  - Solo-format: team_number/flight_number nullstilles alltid (ingen lag).
 *  - publish: EKSAKT 4 spillere — < 4 → `min_players_for_mode`,
 *    > 4 → `too_many_players_for_mode`.
 *  - draft tolererer partial state (0..4 spillere).
 *  - duplikat-sjekk uendret.
 *
 * Scoring-toggle: form-feltet `acey_deucey_scoring` ('gross' | 'net').
 * Default 'net' når feltet mangler (Tørny HCP-default-ethos; hindrer at
 * høy-handikapperen alltid er deuce).
 *
 * Mode_config-output: `{kind, team_size: 1, acey_deucey_scoring}`.
 */
function validateAceyDeucey(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const aceyDeuceyScoring = parseScoringToggle(formData, 'acey_deucey_scoring');

  const playersResult = parseSoloPlayers(formData, 8);
  if (!playersResult.ok) {
    return playersResult;
  }
  const players = playersResult.players;

  if (mode === 'publish') {
    if (players.length < 4) {
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
      kind: 'acey_deucey',
      team_size: 1,
      acey_deucey_scoring: aceyDeuceyScoring,
    },
  };
}

/**
 * Bingo Bango Bongo-validator (issue #277).
 *
 * Speiler `validateNassau`/`validateSkins`: individuelt format, 2–16 spillere
 * (#460) ved publish, ingen duplikater, team_number/flight_number nullstilles. BBB
 * bruker ikke gross/net-toggle (poeng er rene prestasjons-poeng fra bingo/bango/
 * bongo — ikke utledet fra slag). mode_config er {kind, team_size: 1}.
 */
function validateBingoBangoBongo(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  // #460: les opptil 17 slots — én over 16-cap-en, så en 17. spiller fanges
  // av cap-sjekken under i stedet for å trunkeres stille til 16.
  const playersResult = parseSoloPlayers(formData, 17);
  if (!playersResult.ok) {
    return playersResult;
  }
  const players = playersResult.players;

  if (mode === 'publish') {
    if (players.length < 2) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 16) {
      return { ok: false, errorCode: 'too_many_players_for_mode' };
    }
  }

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'bingo_bango_bongo',
      team_size: 1,
    },
  };
}

function parseNinesVariant(formData: FormData): 'nines' | 'split_sixes' {
  const raw = String(formData.get('nines_variant') ?? '').trim();
  if (raw === 'split_sixes') return 'split_sixes';
  return 'nines';
}

/**
 * Nines / Split Sixes-validator (issue #278).
 *
 * Individuelt format med NØYAKTIG 3 spillere ved publish. Strokeplay-utledet
 * (ingen egen input-tabell). To config-dimensjoner: nines_variant (nines=9pts
 * 5-3-1, split_sixes=6pts 4-2-0) og nines_scoring (gross|net, default net).
 *
 * Mode_config-output: `{kind, team_size: 1, nines_variant, nines_scoring}`.
 */
function validateNines(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const ninesVariant = parseNinesVariant(formData);
  const ninesScoring = parseScoringToggle(formData, 'nines_scoring');

  const playersResult = parseSoloPlayers(formData, 8);
  if (!playersResult.ok) {
    return playersResult;
  }
  const players = playersResult.players;

  if (mode === 'publish') {
    if (players.length < 3) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    if (players.length > 3) {
      return { ok: false, errorCode: 'too_many_players_for_mode' };
    }
  }

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'nines',
      team_size: 1,
      nines_variant: ninesVariant,
      nines_scoring: ninesScoring,
    },
  };
}

/**
 * Round Robin-validator (issue #280 — 4-spiller roterende-partner 4BBB-matchplay).
 *
 * Strukturell hybrid av et rotation-slot-format og `validateFourballMatchplay`
 * (allowance). Round Robin krever EKSAKT 4 spillere med unike team_number 1-4
 * ved publish (matematisk tvunget, ikke 3-5 som Wolf). Speiler Fourball for allowance:
 * form-feltet `round_robin_allowance_pct` (0..100), default 85 i draft.
 *
 * Regler:
 *  - EKSAKT 4 spillere ved publish; 0–3 → `min_players_for_mode`, 5+ → `too_many_players_for_mode`
 *  - team_number 1-4, alle distinct → ellers `bad_team` / `team_balance`
 *  - flight_number = team_number (DB-CHECK `game_players_team_flight_consistency`)
 *  - draft tolererer partial state (0..4 spillere, ufullstendig slot-fordeling)
 *
 * Mode_config-output: `{kind, team_size: 1, teams_count: 4, allowance_pct}`.
 */
function validateRoundRobin(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const allowancePct = parseRoundRobinAllowancePct(formData, mode);
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
    // Round Robin-slot er strengt 1-4 (rotation-slot, ikke lag) — speiler Wolf.
    if (
      !Number.isInteger(team_number) ||
      team_number < 1 ||
      team_number > 4
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
    // Nøyaktig 4 spillere — sjekk at team_numbers er unike 1-4 (matematisk
    // tvunget for Round Robin, ikke 3-5 som Wolf).
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
      kind: 'round_robin',
      team_size: 1,
      teams_count: 4,
      allowance_pct: allowancePct,
    },
  };
}

/**
 * Leser `round_robin_allowance_pct` fra form-data. Returnerer 0..100 (heltall)
 * eller null hvis ugyldig.
 *
 * Tom string i draft defaulter til 85 (WHS-default for matchplay) så partial
 * form-state ikke kaster; publish krever eksplisitt gyldig verdi (wizarden
 * pre-fyller 85 som fallback). Range 0..100 håndheves uansett.
 * Speiler `parseFourballAllowancePct`-mønsteret.
 */
function parseRoundRobinAllowancePct(
  formData: FormData,
  mode: PayloadMode,
): number | null {
  const raw = formData.get('round_robin_allowance_pct');
  if (raw === null || raw === '') {
    // Draft: defensiv default 85 (WHS-standard for matchplay). Publish: krev
    // eksplisitt verdi via wizard (som alltid pre-fyller 85 som fallback).
    return mode === 'draft' ? 85 : null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 100) return null;
  return n;
}

function parseShambleVariant(formData: FormData): 'shamble' | 'champagne' {
  const raw = String(formData.get('shamble_variant') ?? '').trim();
  if (raw === 'champagne') return 'champagne';
  return 'shamble';
}

/**
 * Leser `shamble_team_size` fra form-data. Returnerer 3, 4 eller null
 * (manglende felt / ugyldig verdi). Shamble spilles i lag à 3 eller 4.
 */
function parseShambleTeamSize(formData: FormData): 3 | 4 | null {
  const raw = String(formData.get('shamble_team_size') ?? '').trim();
  if (raw === '3') return 3;
  if (raw === '4') return 4;
  return null;
}

/**
 * Leser hvor mange laveste scorer som teller per hull. Shamble-preset låser
 * til 2 (count-felt ignoreres). Champagne leser `shamble_count` (1/2/3),
 * defaulter til 2 ved manglende/ugyldig verdi.
 */
function parseShambleCount(
  formData: FormData,
  variant: 'shamble' | 'champagne',
): 1 | 2 | 3 {
  if (variant === 'shamble') return 2;
  const raw = String(formData.get('shamble_count') ?? '').trim();
  if (raw === '1') return 1;
  if (raw === '3') return 3;
  return 2;
}

/**
 * Shamble / Champagne Scramble-validator (issue #285).
 *
 * Lag-format à 3 eller 4. Delt drive, så egen ball — hver spiller eier sin
 * egen score-rad (som best ball, INGEN captain-rad). Lag-struktur speiler
 * texas_scramble (team_number + balanse-sjekk ved publish), men uten
 * captain/handicap-%. Tre config-dimensjoner: variant (shamble/champagne),
 * count (1/2/3, laveste som teller per hull) og scoring (gross/net).
 *
 * Mode_config-output:
 *   `{kind, team_size, teams_count, shamble_variant, shamble_count, shamble_scoring}`.
 */
function validateShamble(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const teamSize = parseShambleTeamSize(formData);
  if (teamSize === null) {
    return { ok: false, errorCode: 'unsupported_mode_size_combo' };
  }

  const variant = parseShambleVariant(formData);
  const scoring = parseScoringToggle(formData, 'shamble_scoring');
  const count = parseShambleCount(formData, variant);

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
    // Flight = team (DB-CHECK game_players_team_flight_consistency), som Texas.
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
    for (const [, teamMembers] of teamCounts) {
      if (teamMembers !== teamSize) {
        return { ok: false, errorCode: 'team_balance' };
      }
    }
  }

  const teams_count = new Set(players.map((p) => p.team_number)).size;

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'shamble',
      team_size: teamSize,
      teams_count,
      shamble_variant: variant,
      shamble_count: count,
      shamble_scoring: scoring,
    },
  };
}

/**
 * Patsome-validator (issue #286 — 6 hull 4BBB → 6 greensome → 6 foursomes).
 *
 * Lag à 2, felt av 2+ lag (ingen fast øvre grense — klubb-format). Speiler
 * `validateTexasScramble` strukturelt for lag-grupperingslogikken, men
 * håndhever `team_size` EKSAKT 2 (ikke konfigurerbar).
 *
 * Regler:
 *  - Totalt < 4 spillere (= < 2 lag à 2) → `min_players_for_mode`.
 *  - Hvert lag-nummer-gruppe må ha EKSAKT 2 spillere → `team_balance`.
 *  - Duplikat-sjekk uendret → `duplicate_player`.
 *  - `team_number` ≥ 1 (positivt heltall) → `bad_team`.
 *  - `flight_number = team_number` for å oppfylle DB-CHECK
 *    `game_players_team_flight_consistency` (begge satt eller null sammen).
 *  - Draft tolererer partial state (ufullstendige lag, < 4 spillere totalt).
 *
 * Scoring-toggle: form-feltet `patsome_scoring` ('gross' | 'net'). Default
 * 'net'. Speiler Wolf/Nassau/Skins/Nines-mønstret.
 *
 * Mode_config-output: `{kind: 'patsome', team_size: 2, teams_count, patsome_scoring}`.
 */
function validatePatsome(
  formData: FormData,
  mode: PayloadMode,
): ModeValidationResult {
  const patsomeScoring = parseScoringToggle(formData, 'patsome_scoring');

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
    // Patsome-spillere speiler Texas/par-stableford/matchplay: flight = team
    // for å oppfylle DB-CHECK game_players_team_flight_consistency (begge satt).
    players.push({ user_id, team_number, flight_number: team_number });
  }

  if (mode === 'publish') {
    if (players.length < 4) {
      return { ok: false, errorCode: 'min_players_for_mode' };
    }
    const teamCounts = new Map<number, number>();
    for (const p of players) {
      if (p.team_number === null) continue;
      teamCounts.set(p.team_number, (teamCounts.get(p.team_number) ?? 0) + 1);
    }
    // Hvert lag må ha EKSAKT 2 spillere — Patsome er 2-spiller-format.
    for (const [, count] of teamCounts) {
      if (count !== 2) {
        return { ok: false, errorCode: 'team_balance' };
      }
    }
  }

  const teams_count = new Set(players.map((p) => p.team_number)).size;

  return {
    ok: true,
    players,
    mode_config: {
      kind: 'patsome',
      team_size: 2,
      teams_count,
      patsome_scoring: patsomeScoring,
    },
  };
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
  ambrose: validateAmbrose,
  florida_scramble: validateFloridaScramble,
  fourball_matchplay: validateFourballMatchplay,
  foursomes_matchplay: validateFoursomesMatchplay,
  greensome_matchplay: validateGreensomeMatchplay,
  chapman_matchplay: validateChapmanMatchplay,
  gruesome_matchplay: validateGruesomeMatchplay,
  wolf: validateWolf,
  nassau: validateNassau,
  skins: validateSkins,
  bingo_bango_bongo: validateBingoBangoBongo,
  nines: validateNines,
  round_robin: validateRoundRobin,
  acey_deucey: validateAceyDeucey,
  shamble: validateShamble,
  patsome: validatePatsome,
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
    let_friends_skip_gate: false,
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

  // #369: «Slipp venner direkte inn». Kun gyldig for manual_approval —
  // force-false for alle andre modi så stale form-verdi ikke lekker.
  const letFriendsSkipGate =
    registrationMode === 'manual_approval' &&
    formData.get('let_friends_skip_gate') === '1';

  return {
    ...base,
    players: modeResult.players,
    game_mode: gameMode,
    mode_config: modeResult.mode_config,
    registration_mode: registrationMode,
    registration_type: registrationType,
    let_friends_skip_gate: letFriendsSkipGate,
  };
}
