// Shared helpers for parsing and validating the admin "create game" / "edit
// game" form payload. Used by both the new-game and edit-game server actions.

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
  | 'mode_locked_after_publish';

export type ParsedPayload = {
  name: string;
  course_id: string | null;
  tee_box_id: string | null;
  hcp_allowance_pct: number;
  require_peer_approval: boolean;
  /** 'live' = netto visible from hole 1. 'reveal' = netto hidden until status='finished'. */
  score_visibility: 'live' | 'reveal';
  players: GamePlayerInput[];
  errorCode?: GameValidationErrorCode;
};

/**
 * Parse a "create/edit game" admin form payload.
 *
 * Mode determines how strictly the payload is validated:
 * - 'publish' enforces the full ruleset (course, tee-box, 8 balanced players,
 *   allowance in [0, 100]). Used when the game is being created/edited as a
 *   ready-to-play 'scheduled' row.
 * - 'draft' tolerates partial data: empty course/tee-box become `null`, the
 *   player list may have any size (including zero), and no team-balance check
 *   runs. Duplicate players are still rejected, and per-player team/flight
 *   numbers are still range-checked when present, so a draft can never carry
 *   incoherent rows forward.
 *
 * Returns the parsed payload with `errorCode` set on the first failure;
 * callers should redirect with that code as a query param.
 */
export function buildGameInsertPayload(
  formData: FormData,
  mode: PayloadMode,
): ParsedPayload {
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

  const base: ParsedPayload = {
    name,
    course_id: rawCourse || null,
    tee_box_id: rawTee || null,
    hcp_allowance_pct,
    require_peer_approval,
    score_visibility,
    players: [],
  };

  if (!name) return { ...base, errorCode: 'name_required' };

  if (mode === 'publish') {
    if (!base.course_id) return { ...base, errorCode: 'course_required' };
    if (!base.tee_box_id) return { ...base, errorCode: 'tee_required' };
    if (
      !Number.isInteger(hcp_allowance_pct) ||
      hcp_allowance_pct < 0 ||
      hcp_allowance_pct > 100
    ) {
      return { ...base, errorCode: 'bad_allowance' };
    }
  }

  const players: GamePlayerInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const user_id = String(formData.get(`player_${i}_id`) ?? '').trim();
    if (!user_id) {
      if (mode === 'publish') {
        return { ...base, errorCode: 'players_required' };
      }
      continue; // draft: skip empty slot
    }
    if (seen.has(user_id)) {
      return { ...base, errorCode: 'duplicate_player' };
    }
    seen.add(user_id);
    const team_number = Number(formData.get(`player_${i}_team`));
    const flight_number = Number(formData.get(`player_${i}_flight`));
    if (!Number.isInteger(team_number) || team_number < 1 || team_number > 4) {
      return { ...base, errorCode: 'bad_team' };
    }
    if (
      !Number.isInteger(flight_number) ||
      flight_number < 1 ||
      flight_number > 4
    ) {
      return { ...base, errorCode: 'bad_flight' };
    }
    players.push({ user_id, team_number, flight_number });
  }

  if (mode === 'publish') {
    const teamCounts = new Map<number, number>();
    for (const p of players) {
      // team_number er garantert satt her — push-stedet over validerer
      // 1..4-range før innsetting. Cast er trygt og forsvinner når
      // funksjonen splittes til mode-aware validators (task 3.2).
      if (p.team_number === null) continue;
      teamCounts.set(p.team_number, (teamCounts.get(p.team_number) ?? 0) + 1);
    }
    for (let t = 1; t <= 4; t++) {
      if (teamCounts.get(t) !== 2) {
        return { ...base, errorCode: 'team_balance' };
      }
    }
  }

  return { ...base, players };
}
