'use client';

import { useMemo, useState } from 'react';
import {
  CLASSIC_DISABLED_CATEGORIES,
  type SideCategoryId,
} from '@/lib/scoring/sideTournamentConfig';
import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';
import type { TeamSize } from './TeamSizeSelector';
import type { CourseOption, InitialValues, PlayerOption } from './GameForm';
import { playerGenderDefault } from '@/lib/games/playerGenderDefault';
import {
  gameModeSupportsTeams,
  type RegistrationMode,
  type RegistrationType,
} from '@/lib/games/registration';

// Lag-numre er en bevisst smal union — andre tall (5, 6, …) er ikke meningsfulle
// i Tørny per d.d. og blir narrower'ed via `isTeamNumber`-guarden under.
export const TEAM_NUMBERS = [1, 2, 3, 4] as const;
export type TeamNumber = (typeof TEAM_NUMBERS)[number];

export const FLIGHT_NUMBERS = [1, 2, 3, 4] as const;

export function isTeamNumber(n: number): n is TeamNumber {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

/**
 * splitmix32 — kort, deterministisk PRNG for Wolf-rotasjon-shuffle.
 *
 * Fisher-Yates over en 4-element array trenger 3 random-uttrekk. Vi vil
 * ha samme rekkefølge ved re-render for samme (seed, players)-input,
 * men annerledes rekkefølge etter neste "Shuffle"-klikk. Native Math.random
 * er ikke seedbar; splitmix32 gir det vi trenger i ~10 linjer.
 */
function splitmix32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x9e3779b9) | 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    z = (z ^ (z >>> 16)) >>> 0;
    return z / 4294967296;
  };
}

// Derive team/flight maps from the optional initialValues.players array so the
// edit page (D4) can pre-fill these without re-implementing the math. Rows
// med ute-av-rekkevidde-team_number eller null (solo-modus) hopper over
// state-tilordning — spilleren blir lagt til selectedPlayerIds, men lag-grid
// står tom for den raden. Holder prop-grensen forgivende uten å smugle bad
// data inn i internal state.
export function deriveAssignmentsFromInitial(initial: InitialValues | undefined) {
  if (!initial?.players) {
    return {
      selectedPlayerIds: [] as string[],
      teamByPlayer: {} as Record<string, TeamNumber>,
      flightByPlayer: {} as Record<string, number>,
    };
  }
  const selectedPlayerIds: string[] = [];
  const teamByPlayer: Record<string, TeamNumber> = {};
  const flightByPlayer: Record<string, number> = {};
  for (const row of initial.players) {
    selectedPlayerIds.push(row.user_id);
    if (row.team_number !== null && isTeamNumber(row.team_number)) {
      teamByPlayer[row.user_id] = row.team_number;
    }
    if (row.flight_number !== null) {
      flightByPlayer[row.user_id] = row.flight_number;
    }
  }
  return { selectedPlayerIds, teamByPlayer, flightByPlayer };
}

/**
 * Velger default-lagstørrelse for en gitt modus. Speilar de aktive
 * kombinasjonene i `TeamSizeSelector.ENABLED_COMBOS` — Stableford → 1,
 * Best ball → 2, Singles matchplay → 1 (én spiller per side, men
 * TeamSizeSelector er skjult for matchplay siden det ikke finnes noen
 * reell lagstørrelse å velge mellom), Solo strokeplay → 1 (én
 * spiller = én rad). Holdt synk separat fordi GameForm trenger en ren
 * funksjon for state-initialisering uten å eksponere selector-internt.
 */
export function defaultTeamSizeForMode(mode: GameMode): TeamSize {
  if (mode === 'stableford') return 1;
  // Modified stableford (#281): solo som default, par valgbart via selector.
  if (mode === 'modified_stableford') return 1;
  if (mode === 'singles_matchplay') return 1;
  if (mode === 'solo_strokeplay') return 1;
  // Texas scramble: default 4-mannslag (typisk firma-cup-størrelse).
  // 2-mannslag valgbart via TeamSizeSelector.
  if (mode === 'texas_scramble') return 4;
  // Wolf: hver spiller er sin egen «row». team_number 1-4 brukes som
  // rotation-slot, ikke som lag-tildeling. team_size=1 betyr requiresTeams=false
  // så vi får solo-style player-selection i step 3.
  if (mode === 'wolf') return 1;
  // Nines / Split Sixes (#278): solo-format (ingen lag), team_size=1 betyr
  // requiresTeams=false så vi får solo-style player-selection i step 3.
  if (mode === 'nines') return 1;
  return 2;
}

/**
 * NGF-default for Texas-scramble-lag-handicap, prosent av summert spille-HCP.
 * Settes som default i GameForm når admin endrer lagstørrelse — admin kan
 * deretter justere fritt i 0..100-range.
 */
export function defaultTexasHandicapPct(teamSize: TeamSize): number {
  if (teamSize === 2) return 25;
  if (teamSize === 4) return 10;
  return 25;
}

// Re-derive gender-toggle defaults fra spillerens profil. Brukes ved mount og
// ved bane-bytte i `setCourseId`, slik at admin ikke mister D/J-merkene når
// banen endres etter at wizard har derived defaults én gang.
export function deriveDefaultGenders(
  players: PlayerOption[],
): Record<string, 'M' | 'D' | 'J'> {
  const out: Record<string, 'M' | 'D' | 'J'> = {};
  for (const p of players) {
    out[p.id] = playerGenderDefault(p.gender, p.level);
  }
  return out;
}

// Fisher–Yates shuffle backed by crypto.getRandomValues for fair, unbiased
// team draws. Math.random would technically work but is not guaranteed
// cryptographically random; using the WebCrypto API removes any doubt.
export function cryptoShuffle<T>(input: T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    // 32-bit unsigned random; modulo bias is negligible for our small i (<=7).
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

import type { Intent } from '@/lib/wizard/intent';

type UseGameFormStateInput = {
  initialValues?: InitialValues;
  players: PlayerOption[];
  courses: CourseOption[];
  // F2 foundation (#272): wizard step 1 setter intent via URL eller bruker-
  // klikk. Tom = wizard viser intent-pickeren først. Cup-link fra
  // /admin/cup/[id] forhåndsvelger 'cup'. Ikke konsumert i denne chunken —
  // bare plumbet gjennom så senere chunks kan render IntentSelector.
  initialIntent?: Intent;
};

/**
 * State + handlers + memoiserte derived values for `GameForm` og den kommende
 * `GameWizard`. Hooken er den enkleste måten å holde scoring-/validerings-
 * reglene samkjørte på tvers av de to presentasjons-strategiene (stacked
 * form vs. flerstegs-wizard). Endringer i validitets-logikk hører hjemme her,
 * ikke i de individuelle seksjonene.
 */
export function useGameFormState({
  initialValues,
  players,
  courses,
  initialIntent,
}: UseGameFormStateInput) {
  // F2 foundation (#272): intent-state for wizard step 1. Initialiseres fra
  // URL via page.tsx → wizard → her. Settbar via setIntent når bruker
  // klikker intent-kort i IntentSelector. Ikke validert mot game_mode ennå
  // — sjekken kommer når FormatGrid/CupSetup lander.
  const [intent, setIntent] = useState<Intent | undefined>(initialIntent);
  // `name` is controlled now (was uncontrolled) so initialValues can pre-fill
  // it on the edit page (D4). Default to '' when not provided.
  const [name, setName] = useState<string>(initialValues?.name ?? '');
  const [courseId, setCourseIdRaw] = useState<string>(
    initialValues?.course_id ?? '',
  );
  const [teeBoxId, setTeeBoxId] = useState<string>(
    initialValues?.tee_box_id ?? '',
  );
  const [playerGenders, setPlayerGenders] = useState<Record<string, 'M' | 'D' | 'J'>>(
    () => initialValues?.player_genders ?? deriveDefaultGenders(players),
  );
  // Required for "Lagre og publiser"; drives the button's disabled state via
  // `canPublish` below. Drafts may omit it. Empty string === "not set".
  const [scheduledTeeOffAt, setScheduledTeeOffAt] = useState<string>(
    initialValues?.scheduled_tee_off_at ?? '',
  );
  // Substring-filter for the spiller-listen. Empty string = vis alle.
  // Klargjør for klubbskala (100+ spillere) der den flate listen blir
  // upraktisk å scrolle gjennom.
  const [playerSearch, setPlayerSearch] = useState<string>('');
  // initialValues is read once at mount — D4's edit page passes a stable
  // snapshot from the DB. If the parent ever needs to push live updates,
  // reset via key prop instead.
  const initialAssignments = deriveAssignmentsFromInitial(initialValues);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(
    initialAssignments.selectedPlayerIds,
  );
  // Team assignment is keyed by player id so it survives changes to the player
  // selection order. A missing entry means "not assigned to any team yet".
  const [teamByPlayer, setTeamByPlayer] = useState<Record<string, TeamNumber>>(
    initialAssignments.teamByPlayer,
  );
  const [flightByPlayer, setFlightByPlayer] = useState<Record<string, number>>(
    initialAssignments.flightByPlayer,
  );
  // HCP-allowance for non-fourball/non-texas modes (best_ball, stableford,
  // singles_matchplay, solo_strokeplay). 0 = brutto (gross-only), 1..100 = netto
  // med den prosenten. Default 100 (fullt course handicap). #266 — eies av
  // AllowanceField i Section 3 (Format), submittes via sentral hidden input.
  const [hcpAllowance, setHcpAllowance] = useState<number>(
    initialValues?.hcp_allowance_pct !== undefined &&
      initialValues.hcp_allowance_pct !== ''
      ? Number(initialValues.hcp_allowance_pct)
      : 100,
  );
  // Texas scramble: lag-handicap-prosent. Initialiseres fra initialValues
  // hvis edit-flyt, ellers default per teamSize. 0 = brutto (laveste lag-
  // gross per hull), 1..100 = netto med den prosenten (NGF-standard 25 for
  // 2-mann, 10 for 4-mann). Eies av AllowanceField i Section 3 (Format)
  // via controlled-modus; `key={teamSize}` på AllowanceField sørger for
  // remount når team-size endres så toggle-state re-initialiseres til
  // ny default.
  const [texasHandicapPct, setTexasHandicapPct] = useState<number>(
    initialValues?.texas_team_handicap_pct !== undefined &&
      initialValues.texas_team_handicap_pct !== ''
      ? Number(initialValues.texas_team_handicap_pct)
      : defaultTexasHandicapPct(
          initialValues?.team_size ??
            defaultTeamSizeForMode(initialValues?.game_mode ?? 'best_ball'),
        ),
  );
  // Fourball matchplay (#217): allowance-prosent (0 = brutto, 1..100 = netto).
  // Pre-fylles fra cup-radens fourball_allowance_pct via initialValues; ellers
  // default 85 (WHS-standard). Validator-en (`validateFourballMatchplay`) leser
  // dette ved publish og avviser verdier utenfor 0..100.
  const [fourballAllowancePct, setFourballAllowancePct] = useState<number>(
    initialValues?.fourball_allowance_pct ?? 85,
  );
  // Foursomes matchplay (#218): allowance-prosent (0 = brutto, 1..100 = netto).
  // Pre-fylles fra cup-radens foursomes_allowance_pct via initialValues; ellers
  // default 50 (WHS-standard for foursomes — diff-basert formel). Validator-en
  // (`validateFoursomesMatchplay`) leser dette ved publish og avviser verdier
  // utenfor 0..100.
  const [foursomesAllowancePct, setFoursomesAllowancePct] = useState<number>(
    initialValues?.foursomes_allowance_pct ?? 50,
  );
  // Wolf (#274): brutto vs netto-toggle. Default 'net' speiler Tørny's
  // ethos. Validatoren (`validateWolf`) leser feltet og faller defensivt
  // tilbake til 'net' ved ugyldig/manglende verdi.
  const [wolfScoring, setWolfScoring] = useState<'gross' | 'net'>(
    initialValues?.wolf_scoring === 'gross' ? 'gross' : 'net',
  );
  // Nassau (#276): brutto vs netto-toggle. Default 'net' speiler Tørny's
  // ethos. Validatoren (`validateNassau`) leser feltet og faller defensivt
  // tilbake til 'net' ved ugyldig/manglende verdi.
  const [nassauScoring, setNassauScoring] = useState<'gross' | 'net'>(
    initialValues?.nassau_scoring === 'gross' ? 'gross' : 'net',
  );
  // Skins (#275): brutto vs netto-toggle. Default 'net' speiler Tørny's
  // ethos. Validatoren (`validateSkins`) leser feltet og faller defensivt
  // tilbake til 'net' ved ugyldig/manglende verdi.
  const [skinsScoring, setSkinsScoring] = useState<'gross' | 'net'>(
    initialValues?.skins_scoring === 'gross' ? 'gross' : 'net',
  );
  // Nines / Split Sixes (#278): variant-toggle (nines vs split_sixes) og
  // scoring-toggle (net vs gross). Default 'nines' + 'net' speiler Tørny's
  // ethos. Validatoren (`validateNines`) leser begge feltene og faller
  // defensivt tilbake til 'nines'/'net' ved ugyldige verdier.
  const [ninesVariant, setNinesVariant] = useState<'nines' | 'split_sixes'>(
    initialValues?.nines_variant === 'split_sixes' ? 'split_sixes' : 'nines',
  );
  const [ninesScoring, setNinesScoring] = useState<'gross' | 'net'>(
    initialValues?.nines_scoring === 'gross' ? 'gross' : 'net',
  );
  // Wolf-rotasjon: en counter som økes hver gang admin trykker "Shuffle".
  // wolfOrder (derived under) hasher (selectedPlayerIds, wolfShuffleSeed) for
  // å produsere en deterministisk-pseudo-random permutasjon. Da kan render-
  // tester stub-e shuffle ved å passere kjent seed.
  const [wolfShuffleSeed, setWolfShuffleSeed] = useState<number>(() =>
    Math.floor(Math.random() * 1_000_000),
  );
  const [requirePeerApproval, setRequirePeerApproval] = useState(
    initialValues?.require_peer_approval ?? false,
  );
  const initialScoreVisibility: 'live' | 'reveal' =
    initialValues?.score_visibility === 'reveal' ? 'reveal' : 'live';
  const lockScoreVisibility = initialValues?.lock_score_visibility ?? false;

  const initialSideEnabled = initialValues?.side_tournament_enabled ?? false;
  const initialLdCount = ([0, 1, 2] as const).includes(
    (initialValues?.side_ld_count ?? 0) as 0 | 1 | 2,
  )
    ? (initialValues?.side_ld_count ?? 0)
    : 0;
  const initialCtpCount = ([0, 1, 2] as const).includes(
    (initialValues?.side_ctp_count ?? 0) as 0 | 1 | 2,
  )
    ? (initialValues?.side_ctp_count ?? 0)
    : 0;
  const lockSideTournament = initialValues?.lock_side_tournament ?? false;
  // v1.2.0: nye spill defaultes til Klassisk. Edit-flyten passer eksplisitt
  // inn det som ligger lagret i DB (kan være tomt array = Full pakke).
  const initialDisabledCategories: readonly SideCategoryId[] =
    initialValues?.side_disabled_categories ?? CLASSIC_DISABLED_CATEGORIES;

  const [sideEnabled, setSideEnabled] = useState<boolean>(initialSideEnabled);

  // Modus + lagstørrelse — wired av epic #41 fase 4. Default-modus er
  // `'best_ball'` for å speile pre-multi-mode-flyten; auto-fix av
  // lagstørrelse skjer i `handleModeChange` slik at ulovlige kombinasjoner
  // ikke kan oppstå.
  const initialMode: GameMode = initialValues?.game_mode ?? 'best_ball';
  const [gameMode, setGameMode] = useState<GameMode>(initialMode);
  const [teamSize, setTeamSize] = useState<TeamSize>(
    initialValues?.team_size ?? defaultTeamSizeForMode(initialMode),
  );
  // Lås når et publisert spill redigeres — backend mode-lock-guard har
  // siste ord, men UI-en speiler det for å unngå utilsiktet validation-error.
  const lockGameMode = initialValues?.lock_game_mode ?? false;
  // F2 (#272): wizard step 2 må vite om bruker faktisk har plukket et
  // format eller om `gameMode` bare er default-en. Initialisert true når
  // edit-flyten eller cup-link-flyten passerer eksplisitt game_mode inn,
  // og when admin klikker et format-kort i FormatGrid.
  const [formatChosen, setFormatChosen] = useState<boolean>(
    initialValues?.game_mode !== undefined || lockGameMode,
  );

  // Self-påmelding (#199). Defaultes til 'invite_only' + 'solo' — dagens
  // flyt bevart 100% når admin ikke aktivt velger noe annet. Edit-flyten
  // pre-fyller fra initialValues hvis spillet allerede er konfigurert.
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>(
    initialValues?.registration_mode ?? 'invite_only',
  );
  const [registrationType, setRegistrationType] = useState<RegistrationType>(
    initialValues?.registration_type ?? 'solo',
  );
  // #199 derived flags
  // - registrationModeSupportsTeams: speilet av gameModeSupportsTeams — UI-
  //   et bruker det til å disable 'team'/'both'-radioene når modus ikke
  //   støtter lag. Eksponert separat så seksjonen ikke trenger å vite om
  //   GameMode-detaljer.
  // - playersStepOptional: true når påmelding ikke er invite_only. Wizard-en
  //   bruker det til å slå av required-gating i steg 3 (admin kan publisere
  //   et tomt spill når andre kan melde seg på).
  const registrationModeSupportsTeams = gameModeSupportsTeams(gameMode);
  const playersStepOptional = registrationMode !== 'invite_only';

  // Bane-bytte: nullstill tee-boks (tee-id er bane-spesifikk) og re-derive
  // M/D/J-defaultene fra profilen. `playerGenders` er ikke tee-spesifikt —
  // re-derive holder D/J-merkene istedenfor å kollapse alle til 'M'.
  function setCourseId(next: string) {
    setCourseIdRaw(next);
    setTeeBoxId('');
    setPlayerGenders(deriveDefaultGenders(players));
  }

  function handleModeChange(next: GameMode) {
    setGameMode(next);
    setFormatChosen(true);
    // Auto-velg eneste aktive lagstørrelse per modus så form-state alltid
    // matcher en gyldig kombinasjon. Når flere kombinasjoner aktiveres
    // (par-stableford, 4-mann-stableford), erstattes dette med en mer
    // fleksibel default-policy — for v1 holder vi det enkelt.
    const nextSize = defaultTeamSizeForMode(next);
    setTeamSize(nextSize);
    // Texas scramble: default lag-handicap-prosent per NGF-konvensjon
    // (25 % for 2-mannslag, 10 % for 4-mannslag). Admin kan deretter justere.
    if (next === 'texas_scramble') {
      setTexasHandicapPct(defaultTexasHandicapPct(nextSize));
    }
    // #199: hvis ny modus ikke har lag-konsept, force-reset registration_type
    // til 'solo' — ellers ville payload-validatoren feilet med
    // `team_registration_unsupported_mode` ved publish.
    if (!gameModeSupportsTeams(next)) {
      setRegistrationType('solo');
    }
  }

  /**
   * Wrapper rundt setTeamSize som også oppdaterer Texas-default-handicap-
   * prosenten når lagstørrelsen endres mens modus er Texas. Dette gir admin
   * en sensible default på 25 → 10 (eller omvendt) når de bytter mellom
   * 2- og 4-mannslag uten å miste muligheten til å overstyre manuelt etterpå.
   */
  function handleTeamSizeChange(next: TeamSize) {
    setTeamSize(next);
    if (gameMode === 'texas_scramble') {
      setTexasHandicapPct(defaultTexasHandicapPct(next));
    }
  }

  // Lag-grid vises kun for moduser som faktisk har lag (teamSize ≥ 2).
  // Solo (1) hopper over hele lag/flight-stien — spillere er en flat liste
  // som persisteres med team_number = null.
  const requiresTeams = teamSize >= 2;

  // Modus-narrowing-flag som styrer ulike grener i form-validering.
  // - isSolo: spillere er en flat liste — gjelder både solo-stableford
  //   (team_size=1) og solo strokeplay (eneste variant, team_size=1).
  //   Begge har samme UI-shape: flat spiller-liste uten lag/flight-grid,
  //   per-spiller-tee-seksjon for HCP-allokering, validering = ≥1 spiller.
  // - isBestBall: dagens 4-lag-à-2 (best_ball, team_size=2). Krever
  //   eksakt 8 spillere fordelt 2-2-2-2 på 4 lag.
  // - isParStableford: 4BBB-stableford. Tillater 1-4 lag á 2 spillere
  //   (2/4/6/8 spillere totalt), partial fyll mot 4-lag-grid-en. Lag uten
  //   spillere bare ignoreres ved publish.
  // - isMatchplay: singles_matchplay. Nøyaktig 2 spillere, én på hver side
  //   (team_number 1 og 2). Eget side-tilordnings-UI som erstatter både
  //   lag-grid og flight-seksjonen. TeamSizeSelector skjules siden valget
  //   er meningsløst (kun 1v1 er gyldig).
  const isSolo =
    teamSize === 1 &&
    (isStablefordFamily(gameMode) || gameMode === 'solo_strokeplay');
  const isBestBall = gameMode === 'best_ball' && teamSize === 2;
  const isParStableford = isStablefordFamily(gameMode) && teamSize === 2;
  const isMatchplay = gameMode === 'singles_matchplay';
  // - isTexas: texas_scramble. Lagene spiller én ball — én score per lag per
  //   hull lagres på lag-kapteinens userId (scoring-laget velger kaptein
  //   lex-min). team_size = 2 eller 4 (3-mannslag utsatt til v1.1). Lag-grid-en
  //   speiler par-stableford-mønsteret (fri lag-count, hvert lag må ha
  //   eksakt team_size spillere), men slot-antallet per lag justeres etter
  //   team_size. Lag-handicap = NGF-aggregat (default 25 % for 2-mannslag,
  //   10 % for 4-mannslag — admin kan justere).
  const isTexas = gameMode === 'texas_scramble';
  // - isWolf: 4-spiller rotating partner-format. team_number 1-4 brukes som
  //   rotation-slot (random permutasjon ved publish). team_size=1, ingen
  //   lag-grid. Eget WolfSetup-step i step 2 for scoring-toggle + shuffle.
  const isWolf = gameMode === 'wolf';
  // - isNassau: solo-format, 2-4 spillere. Front 9 / back 9 / total 18 er tre
  //   separate konkurranser. Egen NassauSetup-step i step 2 for scoring-toggle.
  const isNassau = gameMode === 'nassau';
  // - isSkins: solo-format med carryover, 2-4 spillere. Hvert hull er verdt
  //   1 skin; delte hull ruller skinnet videre. Egen SkinsSetup-step i step 2.
  const isSkins = gameMode === 'skins';
  // - isNines: individuelt format, nøyaktig 3 spillere. Nines (9 poeng per
  //   hull, 5–3–1) eller Split Sixes (6 poeng, 4–2–0). Eigen NinesSetup-step
  //   i step 2.
  const isNines = gameMode === 'nines';

  // Drafts can be saved without a tee-off; publishing cannot. `canPublish`
  // below combines this with the rest of the validity gates.
  const hasTeeOff = scheduledTeeOffAt !== '';

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId],
  );

  // Filtrert spiller-liste — case-insensitive substring-match på
  // navn/nickname/email. Vi ekskluderer ALLEREDE-valgte fra listen siden
  // de står som chips ovenfor. Tom query = alle ikke-valgte. `useMemo`
  // unngår onødvendige recomputes på re-render av andre felter (tee, hcp,
  // sideturnering osv.) — viktig når listen kan vokse til 100+.
  const filteredPlayers = useMemo(() => {
    const query = playerSearch.trim().toLowerCase();
    const selectedSet = new Set(selectedPlayerIds);
    return players.filter((p) => {
      if (selectedSet.has(p.id)) return false;
      if (query === '') return true;
      const haystacks = [p.name ?? '', p.nickname ?? '', p.email];
      return haystacks.some((h) => h.toLowerCase().includes(query));
    });
  }, [players, playerSearch, selectedPlayerIds]);

  const availableTees = selectedCourse?.tee_boxes ?? [];

  const eightSelected = selectedPlayerIds.length === 8;

  // Map team -> [playerId, playerId | undefined] so each lag-card can display
  // its two slots even before they're filled.
  const playersByTeam = useMemo(() => {
    const result: Record<TeamNumber, string[]> = { 1: [], 2: [], 3: [], 4: [] };
    for (const pid of selectedPlayerIds) {
      const t = teamByPlayer[pid];
      if (t) result[t].push(pid);
    }
    return result;
  }, [selectedPlayerIds, teamByPlayer]);

  const teamsComplete =
    eightSelected &&
    TEAM_NUMBERS.every((t) => playersByTeam[t].length === 2) &&
    selectedPlayerIds.every((pid) => teamByPlayer[pid] !== undefined);

  // Default flights: lag 1 + lag 2 = flight 1, lag 3 + lag 4 = flight 2.
  // Recomputed any time teams change so admin sees a sensible baseline; the
  // admin can still override per player.
  function teamDefaultFlight(team: TeamNumber): number {
    if (team === 1 || team === 2) return 1;
    return 2;
  }

  // Players-first-flow (epic #41, fase 4): spiller-toggle setter BARE
  // selectedPlayerIds. Lag-tilordning skjer eksplisitt enten via dagens
  // slot-dropdowns eller via «Trekk tilfeldig»-knappen — ingen auto-fill
  // ved checkbox-klikk. Det åpner for solo-modus (stableford) der lag
  // ikke eksisterer, og for fremtidige lagstørrelser (4-mann) der den
  // gamle 2-2-2-2-auto-fillen er feil.
  //
  // Øvre grense på 8 håndhetes nå av per-mode-validatoren i
  // gamePayload.ts heller enn her — det er en mode-spesifikk regel
  // (best-ball-netto kun) som flyttet seg ut av UI-en.
  function togglePlayer(playerId: string) {
    setSelectedPlayerIds((prev) => {
      if (prev.includes(playerId)) {
        // Removing also clears their team/flight assignment så state ikke
        // henger igjen som «zombie»-data om admin senere re-velger spilleren.
        setTeamByPlayer((tp) => {
          const next = { ...tp };
          delete next[playerId];
          return next;
        });
        setFlightByPlayer((fp) => {
          const next = { ...fp };
          delete next[playerId];
          return next;
        });
        return prev.filter((id) => id !== playerId);
      }
      return [...prev, playerId];
    });
  }

  function drawRandomTeams() {
    if (!eightSelected) return;
    const shuffled = cryptoShuffle(selectedPlayerIds);
    const nextTeams: Record<string, TeamNumber> = {};
    const nextFlights: Record<string, number> = {};
    for (let i = 0; i < 8; i++) {
      const team = (Math.floor(i / 2) + 1) as TeamNumber;
      nextTeams[shuffled[i]] = team;
      nextFlights[shuffled[i]] = teamDefaultFlight(team);
    }
    setTeamByPlayer(nextTeams);
    setFlightByPlayer(nextFlights);
  }

  function clearTeams() {
    setTeamByPlayer({});
    setFlightByPlayer({});
  }

  /**
   * Tilordner en spiller til et lag-slot. `slotIndex` er den positionelle
   * indexen i `playersByTeam[team]` — best-ball og par-stableford bruker
   * 0 eller 1 (2 plasser per lag), Texas scramble bruker 0..teamSize-1
   * (2 eller 4 plasser per lag).
   */
  function assignPlayerToSlot(
    team: TeamNumber,
    slotIndex: number,
    playerId: string,
  ) {
    setTeamByPlayer((prev) => {
      const next: Record<string, TeamNumber> = { ...prev };
      // Free up the current slot occupant (if any) on this team.
      const currentInSlot = playersByTeam[team][slotIndex];
      if (currentInSlot) {
        delete next[currentInSlot];
      }
      if (playerId) {
        // If the chosen player is already on another team, move them out first.
        const prevTeam = prev[playerId];
        if (prevTeam !== undefined && prevTeam !== team) {
          // Already handled because we set next[playerId] below — overwrite wins.
        }
        next[playerId] = team;
      }
      return next;
    });
    setFlightByPlayer((prev) => {
      // Whenever a slot changes, reset the flight for the new occupant to the
      // team default — admin can still tweak per player below.
      const next = { ...prev };
      if (playerId) {
        next[playerId] = teamDefaultFlight(team);
      }
      return next;
    });
  }

  function setFlightForPlayer(playerId: string, flight: number) {
    setFlightByPlayer((prev) => ({ ...prev, [playerId]: flight }));
  }

  /**
   * Matchplay: tilordne en spiller til side 1 eller 2 (lagrer i `teamByPlayer`
   * siden payloaden bruker team_number-feltet for side-tilordning). Hvis
   * spilleren allerede står på den ANDRE siden flyttes hen automatisk. Hvis
   * den nye siden allerede har en spiller, bytter de plass (idiomatic swap)
   * — gir en mer forgivende UX enn å nekte byttet.
   *
   * playerId === '' = «Tom plass»-valg fra dropdown; fjerner kun gjeldende
   * okkupant uten å sette en ny.
   */
  function assignPlayerToSide(side: 1 | 2, playerId: string) {
    setTeamByPlayer((prev) => {
      const next: Record<string, TeamNumber> = { ...prev };
      // Frigjør den siden vi tilordner til (hvis okkupert).
      const currentOnThisSide = selectedPlayerIds.find(
        (pid) => prev[pid] === side,
      );
      if (playerId === '') {
        // «Tom plass» — kun fjern okkupanten.
        if (currentOnThisSide) delete next[currentOnThisSide];
        return next;
      }
      // Spilleren kommer kanskje fra den andre siden — sjekk om de skal byttes.
      const otherSide: 1 | 2 = side === 1 ? 2 : 1;
      const prevSideOfChosen = prev[playerId];
      if (prevSideOfChosen === otherSide && currentOnThisSide) {
        // Swap: spilleren på den andre siden flytter hit, og den vi
        // erstattet flytter dit. Bevarer at begge står på hver sin side
        // uten at admin må klikke seg gjennom et mellomsteg.
        next[currentOnThisSide] = otherSide;
        next[playerId] = side;
      } else {
        if (currentOnThisSide && currentOnThisSide !== playerId) {
          delete next[currentOnThisSide];
        }
        next[playerId] = side;
      }
      return next;
    });
    // Flight = team_number for matchplay (samme mønster som par-stableford).
    setFlightByPlayer((prev) => {
      const next = { ...prev };
      if (playerId !== '') {
        next[playerId] = side;
      }
      return next;
    });
  }

  // The serialized payload sent to the server action. Holder seg mode-aware:
  // - team-spillmodi (teamSize ≥ 2): inkluderer kun spillere som har en
  //   team-tilordning, ordnet stabilt etter lag for deterministisk
  //   `player_${i}_*`-skjema. Drafts round-tripper partial rosters; publish-
  //   knappen er separat gated av `canPublish`.
  //   - best-ball: flight kan endres per spiller (FLIGHT-seksjonen viser
  //     dropdown), falles tilbake til teamDefaultFlight ved manglende verdi
  //   - par-stableford: flight = team_number automatisk (par-stableford
  //     bruker ikke separate flighter; gamePayload-validatoren godtar både
  //     varianter, men vi setter flight = team eksplisitt for å matche
  //     mønstret i Phase 1-testene)
  // - matchplay (singles_matchplay): kun spillere som er tilordnet en side
  //   (team_number 1 eller 2), ordnet side-1-først så side-2 for
  //   deterministisk skjema. flight_number = team_number (samme mønster
  //   som par-stableford — matchplay-validatoren i `gamePayload.ts`
  //   krever begge satt sammen pga DB-CHECK `game_players_team_flight_consistency`).
  // - solo-modi (teamSize === 1, stableford ELLER solo_strokeplay):
  //   inkluderer ALLE selectedPlayerIds, ingen lag/flight-felter. Hidden-
  //   input-skjemaet bærer player_${i}_id alene — gamePayload.ts
  //   validatoren (`validateStableford` / `validateSoloStrokeplay`)
  //   leser opp til 8 slots og ignorerer manglende team/flight-felt for
  //   begge solo-modusene.
  //
  // Wolf-rotasjon: deterministisk shuffle av selectedPlayerIds basert på
  // wolfShuffleSeed. Fisher-Yates med splitmix32-PRNG seedet på seed-en.
  // Reseeding gjør at admin kan "Shuffle" til de er fornøyde, men ellers
  // er rekkefølgen stabil ved re-render. Tom liste hvis !isWolf eller
  // <4 valgte. ≥4 selected slices til de 4 første (defensive — UI bør
  // gate dette).
  const wolfOrder = useMemo<string[]>(() => {
    if (!isWolf) return [];
    if (selectedPlayerIds.length < 4) return [];
    const base = selectedPlayerIds.slice(0, 4);
    const rng = splitmix32(wolfShuffleSeed);
    const shuffled = [...base];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [isWolf, selectedPlayerIds, wolfShuffleSeed]);

  function shuffleWolfOrder() {
    setWolfShuffleSeed(Math.floor(Math.random() * 1_000_000));
  }

  const orderedPayload = useMemo(() => {
    if (isWolf) {
      // Wolf: emit 4 rader, hver med team_number 1-4 i shuffled rekkefølge.
      // wolfOrder er allerede deterministisk-shuffled basert på
      // (selectedPlayerIds, wolfShuffleSeed). Hvis <4 valgt: emit slot-frie
      // rader så draft-state tåler det. Validator-en (`validateWolf`)
      // håndhever 4-spillers-regelen ved publish.
      if (selectedPlayerIds.length < 4) {
        return selectedPlayerIds.map((pid) => ({
          user_id: pid,
          team_number: null as number | null,
          flight_number: null as number | null,
        }));
      }
      return wolfOrder.map((pid, idx) => ({
        user_id: pid,
        team_number: idx + 1,
        flight_number: idx + 1,
      }));
    }
    if (isMatchplay) {
      const rows: {
        user_id: string;
        team_number: number | null;
        flight_number: number | null;
      }[] = [];
      // Iterer side 1 først, så side 2 — gir deterministisk
      // player_0/player_1-rekkefølge uavhengig av selectedPlayerIds-order.
      // Spillere uten side-tilordning droppes (draft tolererer det;
      // publish-validering melder mangel via missingForPublish).
      for (const side of [1, 2] as const) {
        for (const pid of selectedPlayerIds) {
          if (teamByPlayer[pid] === side) {
            rows.push({
              user_id: pid,
              team_number: side,
              flight_number: side,
            });
          }
        }
      }
      return rows;
    }
    if (!requiresTeams) {
      return selectedPlayerIds.map((pid) => ({
        user_id: pid,
        team_number: null as number | null,
        flight_number: null as number | null,
      }));
    }
    const rows: {
      user_id: string;
      team_number: number | null;
      flight_number: number | null;
    }[] = [];
    for (const team of TEAM_NUMBERS) {
      for (const pid of playersByTeam[team]) {
        const flight =
          isParStableford || isTexas
            ? team
            : (flightByPlayer[pid] ?? teamDefaultFlight(team));
        rows.push({
          user_id: pid,
          team_number: team,
          flight_number: flight,
        });
      }
    }
    return rows;
  }, [isMatchplay, isWolf, requiresTeams, selectedPlayerIds, wolfOrder, playersByTeam, teamByPlayer, flightByPlayer, isParStableford, isTexas]);

  const flightsComplete =
    teamsComplete &&
    selectedPlayerIds.every(
      (pid) =>
        Number.isInteger(flightByPlayer[pid]) &&
        flightByPlayer[pid] >= 1 &&
        flightByPlayer[pid] <= 4,
    );

  const allowanceValid =
    Number.isInteger(hcpAllowance) && hcpAllowance >= 0 && hcpAllowance <= 100;

  // Par-stableford-validitet: minst 1 lag (2 spillere), partall antall
  // spillere, alle valgte spillere har team_number satt, og hvert ikke-tomt
  // lag har EKSAKT 2 spillere. Speiler `validateStablefordTeam` i
  // `lib/games/gamePayload.ts`. Flight-fordeling deles ikke ut separat —
  // flight settes automatisk til team_number (gjenbruker `teamDefaultFlight`
  // er overflødig her siden par-stableford uansett mapper flight = team
  // ved payload-bygging).
  const parStablefordTeamsBalanced = TEAM_NUMBERS.every(
    (t) => playersByTeam[t].length === 0 || playersByTeam[t].length === 2,
  );
  const parStablefordHasAtLeastOneTeam = TEAM_NUMBERS.some(
    (t) => playersByTeam[t].length === 2,
  );
  const parStablefordPlayersValid =
    selectedPlayerIds.length >= 2 &&
    selectedPlayerIds.length % 2 === 0 &&
    selectedPlayerIds.every((pid) => teamByPlayer[pid] !== undefined) &&
    parStablefordTeamsBalanced &&
    parStablefordHasAtLeastOneTeam;

  // Texas-validitet: hvert ikke-tomt lag må ha eksakt teamSize spillere
  // (2 eller 4), alle valgte spillere må ha team_number satt, og minst ett
  // lag må være fullt. Speiler `validateTexasScramble` i `lib/games/gamePayload.ts`.
  const texasTeamsBalanced = TEAM_NUMBERS.every(
    (t) =>
      playersByTeam[t].length === 0 ||
      playersByTeam[t].length === teamSize,
  );
  const texasHasAtLeastOneTeam = TEAM_NUMBERS.some(
    (t) => playersByTeam[t].length === teamSize,
  );
  // Texas tillater team_size=2 eller 4. Med 8-slot-limit i payload-laget
  // betyr det maks 4 lag á 2 (= 8) eller 2 lag á 4 (= 8) spillere.
  const texasHandicapPctValid =
    Number.isInteger(texasHandicapPct) &&
    texasHandicapPct >= 0 &&
    texasHandicapPct <= 100;
  const texasPlayersValid =
    selectedPlayerIds.length >= teamSize &&
    selectedPlayerIds.length % teamSize === 0 &&
    selectedPlayerIds.every((pid) => teamByPlayer[pid] !== undefined) &&
    texasTeamsBalanced &&
    texasHasAtLeastOneTeam &&
    texasHandicapPctValid;

  // Matchplay-validitet: nøyaktig 2 spillere, én på side 1 og én på side 2.
  // Speiler `validateSinglesMatchplay` i `lib/games/gamePayload.ts` —
  // for-mange-feilen meldes separat fra for-få i missingForPublish-stien
  // slik at admin får tydeligere copy.
  const matchplaySide1Count = selectedPlayerIds.filter(
    (pid) => teamByPlayer[pid] === 1,
  ).length;
  const matchplaySide2Count = selectedPlayerIds.filter(
    (pid) => teamByPlayer[pid] === 2,
  ).length;
  const matchplayPlayersValid =
    selectedPlayerIds.length === 2 &&
    matchplaySide1Count === 1 &&
    matchplaySide2Count === 1;

  // Wolf-validitet: nøyaktig 4 spillere. Rotation-slot 1-4 fordeles
  // automatisk via wolfOrder (deterministisk shuffle), så admin trenger
  // ikke å tilordne selv. Speiler `validateWolf` i gamePayload.ts.
  const wolfPlayersValid = isWolf && selectedPlayerIds.length === 4;

  // Nassau-validitet: 2-4 spillere. Solo-format (team/flight null), ingen
  // lag-tilordning. Speiler `validateNassau` i gamePayload.ts.
  const nassauPlayersValid =
    isNassau && selectedPlayerIds.length >= 2 && selectedPlayerIds.length <= 4;

  // Skins-validitet: 2-4 spillere. Solo-format (team/flight null), ingen
  // lag-tilordning. Speiler `validateSkins` i gamePayload.ts.
  const skinsPlayersValid =
    isSkins && selectedPlayerIds.length >= 2 && selectedPlayerIds.length <= 4;

  // Nines-validitet: nøyaktig 3 spillere. Solo-format (team/flight null),
  // ingen lag-tilordning. Speiler `validateNines` i gamePayload.ts.
  const ninesPlayersValid =
    isNines && selectedPlayerIds.length === 3;

  // Modus-spesifikk publish-validitet. Reglene speiler
  // `lib/games/gamePayload.ts` slik at klient og server forteller samme
  // historie til admin når noe mangler:
  // - solo (stableford team_size=1 ELLER solo_strokeplay): minst 1
  //   spiller, ingen lag/flight
  // - best-ball-netto: eksakt 8 spillere fordelt 2-2-2-2 på 4 lag +
  //   flight-fordeling per spiller
  // - par-stableford (team_size=2): 2/4/6/8 spillere, hvert ikke-tomt lag
  //   à 2, ingen separat flight-validering (flight = team automatisk)
  // - matchplay (singles_matchplay): nøyaktig 2 spillere, én på hver side
  const playersValidForMode = isMatchplay
    ? matchplayPlayersValid
    : isSolo
      ? selectedPlayerIds.length >= 1
      : isBestBall
        ? eightSelected && teamsComplete && flightsComplete
        : isParStableford
          ? parStablefordPlayersValid
          : isTexas
            ? texasPlayersValid
            : isWolf
              ? wolfPlayersValid
              : isNassau
                ? nassauPlayersValid
                : isSkins
                  ? skinsPlayersValid
                  : isNines
                    ? ninesPlayersValid
                    : false;

  // Publishing requires every section to be valid AND a tee-off time. Drafts
  // skip these gates entirely (they only need a name).
  //
  // For Texas scramble erstattes `allowanceValid` av `texasHandicapPctValid`
  // (allerede speilet i `texasPlayersValid` -> `playersValidForMode`) siden
  // hcp_allowance_pct ikke gjelder for Texas — lag-handicap-prosenten lever
  // i `mode_config.team_handicap_pct` istedenfor games.hcp_allowance_pct.
  // Når selv-påmelding er på (open / manual_approval) blir spillerlisten
  // valgfri ved publish — speiler effective-mode-flippen i
  // `buildGameInsertPayload`. Admin kan publisere et tomt spill og la
  // spillerne melde seg på via lenken.
  const canPublish =
    courseId !== '' &&
    teeBoxId !== '' &&
    (playersStepOptional || playersValidForMode) &&
    (isTexas || isWolf || isNassau || isSkins || isNines || allowanceValid) &&
    hasTeeOff;

  // Human-readable list of what's still missing for a publish. Mode-aware:
  // best-ball-stien teller opp til 8 spillere + lag-/flight-fordeling,
  // par-stableford-stien forventer partall-spillere balansert på lag á 2,
  // matchplay-stien krever nøyaktig 2 spillere fordelt 1+1 på sidene,
  // og solo-stien melder bare manglende spiller(e). Rekkefølgen speiler
  // form-seksjonene så meldingen scanner top-to-bottom.
  const missingForPublish: string[] = [];
  if (courseId === '') missingForPublish.push('bane');
  if (teeBoxId === '') missingForPublish.push('tee-boks');
  if (!hasTeeOff) missingForPublish.push('tee-off-tid');
  // Når selv-påmelding er på er spillerlisten valgfri ved publish; vi
  // hopper over per-modus completeness-meldingene helt. hcp_allowance-
  // sjekken nederst gjelder fortsatt fordi den er en konfig-verdi, ikke
  // en spiller-liste-validering.
  if (playersStepOptional) {
    // intentionally skip player-list-related missing messages
  } else if (isMatchplay) {
    if (selectedPlayerIds.length === 0) {
      missingForPublish.push('2 spillere');
    } else if (selectedPlayerIds.length === 1) {
      missingForPublish.push('1 spiller til');
    } else if (selectedPlayerIds.length > 2) {
      // Eksplisitt copy som speiler `too_many_players_for_mode`-feilkoden
      // fra server-action. Matchplay er strengt 1v1 — admin må fjerne
      // overflødige før publish.
      missingForPublish.push(
        'for mange spillere — matchplay krever nøyaktig 2',
      );
    } else if (!matchplayPlayersValid) {
      // 2 spillere valgt, men ikke fordelt 1+1 på sidene. Den eneste
      // gjenstående muligheten er at begge står på samme side eller
      // mangler side-tilordning.
      missingForPublish.push('én spiller på hver side');
    }
  } else if (isBestBall) {
    if (selectedPlayerIds.length < 8) {
      const remaining = 8 - selectedPlayerIds.length;
      missingForPublish.push(
        `${remaining} ${remaining === 1 ? 'spiller' : 'spillere'}`,
      );
    } else if (!teamsComplete) {
      missingForPublish.push('lag-fordeling');
    } else if (!flightsComplete) {
      missingForPublish.push('flight-fordeling');
    }
  } else if (isParStableford) {
    if (selectedPlayerIds.length < 2) {
      missingForPublish.push('minst 2 spillere');
    } else if (selectedPlayerIds.length % 2 !== 0) {
      missingForPublish.push('partall antall spillere');
    } else if (!parStablefordPlayersValid) {
      // Spillere er valgt og partall, men ikke alle er tilordnet et lag
      // eller noen lag har 1 spiller. Én melding dekker begge tilfellene
      // for å holde mangel-listen kort.
      missingForPublish.push('lag-fordeling (par à 2)');
    }
  } else if (isTexas) {
    // Texas: lagstørrelse 2 eller 4. Trenger minst teamSize spillere
    // fordelt på minst ett fullt lag. Mangler-meldingene speiler
    // `validateTexasScramble`-feilene fra payload-laget.
    if (selectedPlayerIds.length < teamSize) {
      missingForPublish.push(`minst ${teamSize} spillere`);
    } else if (selectedPlayerIds.length % teamSize !== 0) {
      missingForPublish.push(
        teamSize === 2
          ? 'partall antall spillere (lag á 2)'
          : 'antall spillere delelig på 4 (lag á 4)',
      );
    } else if (!texasPlayersValid) {
      missingForPublish.push(
        teamSize === 2
          ? 'lag-fordeling (lag á 2)'
          : 'lag-fordeling (lag á 4)',
      );
    }
    if (!texasHandicapPctValid) {
      missingForPublish.push('lag-handicap-prosent (0-100)');
    }
  } else if (isWolf) {
    // Wolf: krever nøyaktig 4 spillere. Rotation-slot fordeles automatisk
    // via wolfOrder, så ingen lag-tilordning trengs i UI.
    if (selectedPlayerIds.length < 4) {
      const remaining = 4 - selectedPlayerIds.length;
      missingForPublish.push(
        `${remaining} ${remaining === 1 ? 'spiller' : 'spillere'} til`,
      );
    } else if (selectedPlayerIds.length > 4) {
      missingForPublish.push(
        'for mange spillere — Wolf krever nøyaktig 4',
      );
    }
  } else if (isNassau) {
    // Nassau: 2-4 spillere, solo (ingen lag-tilordning).
    if (selectedPlayerIds.length < 2) {
      const remaining = 2 - selectedPlayerIds.length;
      missingForPublish.push(
        `${remaining === 1 ? 'minst 1 spiller til' : 'minst 2 spillere'}`,
      );
    } else if (selectedPlayerIds.length > 4) {
      missingForPublish.push(
        'for mange spillere — Nassau krever 2-4',
      );
    }
  } else if (isSkins) {
    // Skins: 2-4 spillere, solo (ingen lag-tilordning).
    if (selectedPlayerIds.length < 2) {
      const remaining = 2 - selectedPlayerIds.length;
      missingForPublish.push(
        `${remaining === 1 ? 'minst 1 spiller til' : 'minst 2 spillere'}`,
      );
    } else if (selectedPlayerIds.length > 4) {
      missingForPublish.push(
        'for mange spillere — Skins krever 2-4',
      );
    }
  } else if (isNines) {
    // Nines: nøyaktig 3 spillere, solo (ingen lag-tilordning).
    if (selectedPlayerIds.length < 3) {
      const remaining = 3 - selectedPlayerIds.length;
      missingForPublish.push(
        `${remaining === 1 ? '1 spiller til' : `${remaining} spillere til`}`,
      );
    } else if (selectedPlayerIds.length > 3) {
      missingForPublish.push(
        'for mange spillere — Nines krever nøyaktig 3',
      );
    }
  } else if (selectedPlayerIds.length < 1) {
    // isSolo
    missingForPublish.push('minst én spiller');
  }
  // hcp_allowance_pct gjelder ikke for Texas, Wolf, Nassau eller Skins — disse
  // modusene har sin egen scoring-konfig i mode_config. Hopper over
  // allowance-sjekken så admin ikke får mismatch mellom UI-skjult-felt og
  // publish-feilmelding.
  if (!isTexas && !isWolf && !isNassau && !isSkins && !isNines && !allowanceValid)
    missingForPublish.push('gyldig HCP-allowance');

  return {
    // Raw state
    name,
    setName,
    courseId,
    setCourseId,
    teeBoxId,
    setTeeBoxId,
    playerGenders,
    setPlayerGenders,
    scheduledTeeOffAt,
    setScheduledTeeOffAt,
    playerSearch,
    setPlayerSearch,
    selectedPlayerIds,
    teamByPlayer,
    flightByPlayer,
    hcpAllowance,
    setHcpAllowance,
    texasHandicapPct,
    setTexasHandicapPct,
    fourballAllowancePct,
    setFourballAllowancePct,
    foursomesAllowancePct,
    setFoursomesAllowancePct,
    wolfScoring,
    setWolfScoring,
    wolfOrder,
    shuffleWolfOrder,
    nassauScoring,
    setNassauScoring,
    skinsScoring,
    setSkinsScoring,
    ninesVariant,
    setNinesVariant,
    ninesScoring,
    setNinesScoring,
    requirePeerApproval,
    setRequirePeerApproval,
    sideEnabled,
    setSideEnabled,
    gameMode,
    teamSize,
    formatChosen,
    intent,
    setIntent,
    registrationMode,
    setRegistrationMode,
    registrationType,
    setRegistrationType,
    registrationModeSupportsTeams,
    playersStepOptional,
    // Initial / lock flags surfaced for components that render them as
    // defaultChecked / disabled (radios + Side-Tournament-fieldset).
    initialScoreVisibility,
    lockScoreVisibility,
    initialLdCount,
    initialCtpCount,
    lockSideTournament,
    initialDisabledCategories,
    lockGameMode,
    // Derived flags
    requiresTeams,
    isSolo,
    isBestBall,
    isParStableford,
    isMatchplay,
    isTexas,
    isWolf,
    isNassau,
    isSkins,
    isNines,
    hasTeeOff,
    // Memoiserte derivasjoner
    selectedCourse,
    filteredPlayers,
    availableTees,
    eightSelected,
    playersByTeam,
    teamsComplete,
    flightsComplete,
    orderedPayload,
    // Validitets-flags
    allowanceValid,
    texasHandicapPctValid,
    parStablefordPlayersValid,
    texasPlayersValid,
    matchplayPlayersValid,
    ninesPlayersValid,
    playersValidForMode,
    canPublish,
    missingForPublish,
    // Handlers
    togglePlayer,
    handleModeChange,
    handleTeamSizeChange,
    drawRandomTeams,
    clearTeams,
    assignPlayerToSlot,
    assignPlayerToSide,
    setFlightForPlayer,
    // Helper for slot dropdowns — knytter playersByTeam/selectedPlayerIds-state
    // sammen med players-prop-lookup for å gi en stabil opsjons-liste per slot.
    slotOptions(team: TeamNumber, slotIndex: number) {
      const current = playersByTeam[team][slotIndex];
      const unassigned = selectedPlayerIds.filter(
        (pid) => teamByPlayer[pid] === undefined,
      );
      const ids = new Set<string>([
        ...(current ? [current] : []),
        ...unassigned,
      ]);
      return Array.from(ids)
        .map((pid) => players.find((p) => p.id === pid))
        .filter((p): p is PlayerOption => p !== undefined);
    },
    // Default-flight per lag (1+2 → flight 1, 3+4 → flight 2). Eksponeres
    // slik at FlightsSection (inne i TeamsAssignmentSection) kan vise samme
    // fallback som payload-bygging bruker.
    teamDefaultFlight,
  };
}

export type GameFormState = ReturnType<typeof useGameFormState>;
