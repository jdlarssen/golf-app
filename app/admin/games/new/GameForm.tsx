'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { SideCategoriesPicker } from '@/components/admin/SideCategoriesPicker';
import {
  CLASSIC_DISABLED_CATEGORIES,
  type SideCategoryId,
} from '@/lib/scoring/sideTournamentConfig';
import { ModeSelector } from './ModeSelector';
import { TeamSizeSelector, type TeamSize } from './TeamSizeSelector';
import type { GameMode } from '@/lib/scoring/modes/types';

export type CourseOption = {
  id: string;
  name: string;
  tee_boxes: {
    id: string;
    name: string;
    has_mens: boolean;
    has_ladies: boolean;
    has_juniors: boolean;
  }[];
};

function formatRatingBadge(tee: {
  has_mens: boolean;
  has_ladies: boolean;
  has_juniors: boolean;
}): string {
  const parts: string[] = [];
  if (tee.has_mens) parts.push('herre');
  if (tee.has_ladies) parts.push('dame');
  if (tee.has_juniors) parts.push('junior');
  return parts.join(' · ');
}

export type PlayerOption = {
  id: string;
  name: string | null;       // null while invitee hasn't completed profile
  nickname: string | null;
  hcp_index: number;
  email: string;
  pending: boolean;          // derived from profile_completed_at IS NULL
};

const TEAM_NUMBERS = [1, 2, 3, 4] as const;
type TeamNumber = (typeof TEAM_NUMBERS)[number];

export type InitialValues = {
  name?: string;
  course_id?: string;
  tee_box_id?: string;
  /** Format: 'YYYY-MM-DDTHH:mm' in Europe/Oslo local time (matches datetime-local input). */
  scheduled_tee_off_at?: string;
  hcp_allowance_pct?: string;
  require_peer_approval?: boolean;
  /** 'live' (default) shows netto immediately; 'reveal' hides it until the game finishes. */
  score_visibility?: 'live' | 'reveal';
  /**
   * When true, the score_visibility radios are disabled (status === 'active' |
   * 'finished'). The edit page already redirects away from those states, so in
   * practice this is always false today — but threading the flag through
   * matches the task spec and future-proofs against a status-based edit page
   * variant that might allow reading the form while locked.
   */
  lock_score_visibility?: boolean;
  /** Whether the side-tournament module is enabled for this game. Default false. */
  side_tournament_enabled?: boolean;
  /** Antall LD-vinnere (0/1/2). Krever side_tournament_enabled=true. */
  side_ld_count?: number;
  /** Antall CTP-vinnere (0/1/2). Krever side_tournament_enabled=true. */
  side_ctp_count?: number;
  /**
   * v1.2.0 — kategorier som er slått av for dette spillet. Tomt array = Full
   * pakke (alle på). For NYE spill defaultes denne til `CLASSIC_DISABLED_CATEGORIES`
   * av GameForm hvis ikke satt — dvs. spill-opprett-flyten starter på Klassisk
   * (matcher v1.1.x-oppførsel for spill opprettet før v1.2.0).
   */
  side_disabled_categories?: readonly SideCategoryId[];
  /** Lås feltene (når status er active/finished). */
  lock_side_tournament?: boolean;
  /** Per-player tee selection. Missing key defaults to 'M' in the form state. */
  player_genders?: Record<string, 'M' | 'D' | 'J'>;
  players?: Array<{
    user_id: string;
    // Widened to `number | null` ved prop-grensen siden 0030 gjorde
    // team/flight nullable for solo-modus (stableford). deriveAssignmentsFromInitial
    // validerer/narrower bare når feltet er satt (1..4) — null-rader hopper
    // over team/flight-state og lar lag-tilordnings-grid stå tom.
    team_number: number | null;
    flight_number: number | null;
  }>;
  /**
   * Valgt spillmodus. Innført med epic #41 fase 4. Defaulter til
   * `'best_ball_netto'` så eksisterende edit-flyt for pre-multi-mode-spill
   * fungerer uten endring.
   */
  game_mode?: GameMode;
  /**
   * Lagstørrelse. Defaulter til 2 (matcher dagens best-ball-flyt) hvis
   * mode = best_ball_netto, eller 1 hvis mode = stableford. Initialiserings-
   * logikken i GameForm-state-en sikrer at verdien alltid matcher modus.
   */
  team_size?: TeamSize;
  /**
   * Lås modus + lagstørrelse (når status er scheduled/active/finished).
   * Backend mode-lock-guard har siste ord, men UI-en skal vise låste
   * felter for å unngå at admin trigger en validation error utilsiktet.
   */
  lock_game_mode?: boolean;
};

/**
 * Discriminated union describing which flow the form is wired for. Each `kind`
 * carries exactly the actions it needs — TypeScript narrows per call site so
 * we no longer need runtime guards to police missing/extra action props.
 */
export type GameFormMode =
  | {
      kind: 'create';
      createDraftAction: (formData: FormData) => Promise<void>;
      createAndPublishAction: (formData: FormData) => Promise<void>;
    }
  | {
      kind: 'edit-draft';
      gameId: string;
      saveDraftAction: (gameId: string, formData: FormData) => Promise<void>;
      publishAction: (gameId: string, formData: FormData) => Promise<void>;
    }
  | {
      kind: 'edit-scheduled';
      gameId: string;
      updateAction: (gameId: string, formData: FormData) => Promise<void>;
    };

type Props = {
  courses: CourseOption[];
  players: PlayerOption[];
  mode: GameFormMode;
  initialValues?: InitialValues;
};

const FLIGHT_NUMBERS = [1, 2, 3, 4] as const;

function isTeamNumber(n: number): n is TeamNumber {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

// Derive team/flight maps from the optional initialValues.players array so the
// edit page (D4) can pre-fill these without re-implementing the math. Rows
// med ute-av-rekkevidde-team_number eller null (solo-modus) hopper over
// state-tilordning — spilleren blir lagt til selectedPlayerIds, men lag-grid
// står tom for den raden. Holder prop-grensen forgivende uten å smugle bad
// data inn i internal state.
function deriveAssignmentsFromInitial(initial: InitialValues | undefined) {
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
 * Best ball netto → 2. Holdt synk separat fordi GameForm trenger en
 * ren funksjon for state-initialisering uten å eksponere selector-internt.
 */
function defaultTeamSizeForMode(mode: GameMode): TeamSize {
  return mode === 'stableford' ? 1 : 2;
}

// Fisher–Yates shuffle backed by crypto.getRandomValues for fair, unbiased
// team draws. Math.random would technically work but is not guaranteed
// cryptographically random; using the WebCrypto API removes any doubt.
function cryptoShuffle<T>(input: T[]): T[] {
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

export function GameForm({ courses, players, mode, initialValues }: Props) {
  // `name` is controlled now (was uncontrolled) so initialValues can pre-fill
  // it on the edit page (D4). Default to '' when not provided.
  const [name, setName] = useState<string>(initialValues?.name ?? '');
  const [courseId, setCourseId] = useState<string>(
    initialValues?.course_id ?? '',
  );
  const [teeBoxId, setTeeBoxId] = useState<string>(
    initialValues?.tee_box_id ?? '',
  );
  const [playerGenders, setPlayerGenders] = useState<Record<string, 'M' | 'D' | 'J'>>(
    initialValues?.player_genders ?? {},
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
  const [hcpAllowance, setHcpAllowance] = useState<string>(
    initialValues?.hcp_allowance_pct ?? '100',
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
  // `'best_ball_netto'` for å speile pre-multi-mode-flyten; auto-fix av
  // lagstørrelse skjer i `handleModeChange` slik at ulovlige kombinasjoner
  // ikke kan oppstå.
  const initialMode: GameMode = initialValues?.game_mode ?? 'best_ball_netto';
  const [gameMode, setGameMode] = useState<GameMode>(initialMode);
  const [teamSize, setTeamSize] = useState<TeamSize>(
    initialValues?.team_size ?? defaultTeamSizeForMode(initialMode),
  );
  // Lås når et publisert spill redigeres — backend mode-lock-guard har
  // siste ord, men UI-en speiler det for å unngå utilsiktet validation-error.
  const lockGameMode = initialValues?.lock_game_mode ?? false;

  function handleModeChange(next: GameMode) {
    setGameMode(next);
    // Auto-velg eneste aktive lagstørrelse per modus så form-state alltid
    // matcher en gyldig kombinasjon. Når flere kombinasjoner aktiveres
    // (par-stableford, 4-mann-stableford), erstattes dette med en mer
    // fleksibel default-policy — for v1 holder vi det enkelt.
    setTeamSize(defaultTeamSizeForMode(next));
  }

  // Lag-grid vises kun for moduser som faktisk har lag (teamSize ≥ 2).
  // Solo (1) hopper over hele lag/flight-stien — spillere er en flat liste
  // som persisteres med team_number = null.
  const requiresTeams = teamSize >= 2;

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

  function assignPlayerToSlot(
    team: TeamNumber,
    slotIndex: 0 | 1,
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

  // The serialized payload sent to the server action. Holder seg mode-aware:
  // - team-spillmodi (teamSize ≥ 2): inkluderer kun spillere som har en
  //   team-tilordning, ordnet stabilt etter lag for deterministisk
  //   `player_${i}_*`-skjema. Drafts round-tripper partial rosters; publish-
  //   knappen er separat gated av `canPublish`.
  // - solo-modi (teamSize === 1): inkluderer ALLE selectedPlayerIds, ingen
  //   lag/flight-felter. Hidden-input-skjemaet bærer player_${i}_id alene —
  //   gamePayload.ts validatoren leser opp til 8 slots og ignorerer manglende
  //   team/flight-felt for stableford.
  const orderedPayload = useMemo(() => {
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
        rows.push({
          user_id: pid,
          team_number: team,
          flight_number: flightByPlayer[pid] ?? teamDefaultFlight(team),
        });
      }
    }
    return rows;
  }, [requiresTeams, selectedPlayerIds, playersByTeam, flightByPlayer]);

  const flightsComplete =
    teamsComplete &&
    selectedPlayerIds.every(
      (pid) =>
        Number.isInteger(flightByPlayer[pid]) &&
        flightByPlayer[pid] >= 1 &&
        flightByPlayer[pid] <= 4,
    );

  const allowanceNum = Number(hcpAllowance);
  const allowanceValid =
    Number.isInteger(allowanceNum) && allowanceNum >= 0 && allowanceNum <= 100;

  // Modus-spesifikk publish-validitet. Best-ball-netto krever 8 spillere
  // fordelt 2-2-2-2 på 4 lag (dagens regel uendret). Stableford solo krever
  // minst 1 spiller; ingen lag-/flight-stier å fylle. Reglene speiler
  // `lib/games/gamePayload.ts` slik at klient og server forteller samme
  // historie til admin når noe mangler.
  const playersValidForMode = requiresTeams
    ? eightSelected && teamsComplete && flightsComplete
    : selectedPlayerIds.length >= 1;

  // Publishing requires every section to be valid AND a tee-off time. Drafts
  // skip these gates entirely (they only need a name).
  const canPublish =
    courseId !== '' &&
    teeBoxId !== '' &&
    playersValidForMode &&
    allowanceValid &&
    hasTeeOff;

  // Human-readable list of what's still missing for a publish. Mode-aware:
  // best-ball-stien teller opp til 8 spillere + lag-/flight-fordeling,
  // stableford-stien melder bare manglende spiller(e). Rekkefølgen speiler
  // form-seksjonene så meldingen scanner top-to-bottom.
  const missingForPublish: string[] = [];
  if (courseId === '') missingForPublish.push('bane');
  if (teeBoxId === '') missingForPublish.push('tee-boks');
  if (!hasTeeOff) missingForPublish.push('tee-off-tid');
  if (requiresTeams) {
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
  } else if (selectedPlayerIds.length < 1) {
    missingForPublish.push('minst én spiller');
  }
  if (!allowanceValid) missingForPublish.push('gyldig HCP-allowance');

  function playerLabel(p: PlayerOption): string {
    if (p.pending) {
      return p.email;
    }
    const displayName = p.name ?? p.email; // defensive — non-pending should always have name
    const hcp = p.hcp_index.toFixed(1);
    if (p.nickname) return `${displayName} «${p.nickname}» — HCP ${hcp}`;
    return `${displayName} — HCP ${hcp}`;
  }

  function shortName(p: PlayerOption): string {
    if (p.pending) return p.email;
    const displayName = p.name ?? p.email;
    return p.nickname ? `${displayName} «${p.nickname}»` : displayName;
  }

  // Resolve the draft + publish server actions for the two modes that share a
  // draft/publish split (create + edit-draft). Returning `null` for
  // edit-scheduled lets the JSX collapse to one branch without runtime guards.
  function getDraftAndPublishActions():
    | {
        publish: (formData: FormData) => void | Promise<void>;
        draft: (formData: FormData) => void | Promise<void>;
      }
    | null {
    if (mode.kind === 'create') {
      return {
        publish: mode.createAndPublishAction,
        draft: mode.createDraftAction,
      };
    }
    if (mode.kind === 'edit-draft') {
      return {
        publish: mode.publishAction.bind(null, mode.gameId),
        draft: mode.saveDraftAction.bind(null, mode.gameId),
      };
    }
    return null;
  }
  const draftPublishActions = getDraftAndPublishActions();

  // For each slot dropdown: show the current occupant + any UNASSIGNED selected players.
  function slotOptions(team: TeamNumber, slotIndex: 0 | 1) {
    const current = playersByTeam[team][slotIndex];
    const unassigned = selectedPlayerIds.filter(
      (pid) => teamByPlayer[pid] === undefined,
    );
    const ids = new Set<string>([...(current ? [current] : []), ...unassigned]);
    return Array.from(ids)
      .map((pid) => players.find((p) => p.id === pid))
      .filter((p): p is PlayerOption => p !== undefined);
  }

  return (
    <form className="space-y-6">
      {/* Modus + lagstørrelse — hidden inputs slik at server-action mottar
          eksakt det admin valgte i tile-en. `team_size` er teknisk redundant
          (modus + ENABLED_COMBOS gir det back-end), men sender den med
          eksplisitt så form-laget er selv-dokumenterende. */}
      <input type="hidden" name="game_mode" value={gameMode} />
      <input type="hidden" name="team_size" value={teamSize} />

      {/* Hidden inputs that carry the structured assignment payload. The server
          action only ever sees the FormData; keeping the names server-known
          means we don't need an alternate JSON wire format. For solo-modus
          (stableford) sender vi tomme team/flight-strenger — gamePayload-
          validatoren oppdager `game_mode === 'stableford'` og persisterer
          team_number/flight_number som null uansett. */}
      {orderedPayload.map((row, i) => (
        <div key={row.user_id} className="hidden">
          <input type="hidden" name={`player_${i}_id`} value={row.user_id} />
          <input
            type="hidden"
            name={`player_${i}_team`}
            value={row.team_number ?? ''}
          />
          <input
            type="hidden"
            name={`player_${i}_flight`}
            value={row.flight_number ?? ''}
          />
        </div>
      ))}

      {/* Section 1: Basics */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-text">
          1. Spillet
        </h2>
        <Input
          id="name"
          name="name"
          type="text"
          label="Spillnavn"
          placeholder="f.eks. Stiklestad 17. mai"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div>
          <label
            htmlFor="course_id"
            className="block text-sm font-medium text-text mb-1.5"
          >
            Bane
          </label>
          <select
            id="course_id"
            name="course_id"
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setTeeBoxId('');
              setPlayerGenders({});
            }}
            required
            className="w-full rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
          >
            <option value="">Velg bane…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tee_box_id" className="block text-sm font-medium text-text mb-1.5">
            Tee
          </label>
          <select
            id="tee_box_id"
            name="tee_box_id"
            value={teeBoxId}
            onChange={(e) => {
              setTeeBoxId(e.target.value);
              setPlayerGenders({});
            }}
            disabled={!selectedCourse}
            required
            className="w-full rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
          >
            <option value="">{selectedCourse ? 'Velg tee-boks…' : 'Velg bane først'}</option>
            {availableTees.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({formatRatingBadge(t)})
              </option>
            ))}
          </select>
        </div>

        {/* `datetime-local` emits 'YYYY-MM-DDTHH:mm' in browser local time (no
            offset). Server interprets in Europe/Oslo before persisting as
            timestamptz. See actions.ts. */}
        <Input
          id="scheduled_tee_off_at"
          name="scheduled_tee_off_at"
          type="datetime-local"
          label="Tee-off"
          value={scheduledTeeOffAt}
          onChange={(e) => setScheduledTeeOffAt(e.target.value)}
          hint="Påkrevd ved publisering. Valgfritt for utkast."
        />

        {/* Score visibility — radios, not a checkbox, so the two modes read
            as exclusive choices. defaultChecked (uncontrolled) is fine here
            because the field's value is read straight from FormData on
            submit; no other UI state needs to react to it. */}
        <fieldset>
          <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Synlighet under runden
          </legend>
          <div className="mt-2 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="score_visibility"
                value="live"
                defaultChecked={initialScoreVisibility !== 'reveal'}
                disabled={lockScoreVisibility}
                className="mt-1"
              />
              <div>
                <div className="font-serif text-base text-text">
                  Vis alt under runden
                </div>
                <div className="text-xs text-muted">
                  Netto-tall synlige fra hull 1 (standard)
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="score_visibility"
                value="reveal"
                defaultChecked={initialScoreVisibility === 'reveal'}
                disabled={lockScoreVisibility}
                className="mt-1"
              />
              <div>
                <div className="font-serif text-base text-text">
                  Avslør på slutten
                </div>
                <div className="text-xs text-muted">
                  Brutto under runden, netto avsløres når spillet avsluttes
                </div>
              </div>
            </label>
          </div>
          <p className="mt-2 text-xs text-muted">
            Reveal-modus skjuler handicap-slag og netto-rangering under runden.
            Lag med høyere handicap kan slå brutto-lederen — det blir et virkelig
            spennings-moment når du trykker avslutt.
            {lockScoreVisibility && (
              <span className="block mt-1">
                <strong>Kan ikke endres etter spill-start.</strong>
              </span>
            )}
          </p>
        </fieldset>

        {/* Section 1c: Side tournament */}
        <fieldset>
          <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Sideturnering
          </legend>
          <div className="mt-2 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="side_tournament_enabled"
                value="true"
                checked={sideEnabled}
                onChange={(e) => setSideEnabled(e.target.checked)}
                disabled={lockSideTournament}
                className="mt-1"
              />
              <div>
                <div className="font-serif text-base text-text">
                  Legg til sideturnering
                </div>
                <div className="text-xs text-muted">
                  Parallell lag-konkurranse med poeng. Vises etter at spillet er avsluttet.
                </div>
              </div>
            </label>

            {sideEnabled && (
              <div className="space-y-4 rounded-md border border-border bg-surface-2 p-3">
                <p className="text-xs text-muted">
                  Poengfordeling: best netto 18 = 10p, front 9 + back 9 = 5p hver,
                  hole-win = 2p per hull (kun alene-vinner), longest drive + closest to pin = 2p per vinner.
                </p>

                {/* v1.2.0: kategori-velger. Lever sin egne hidden inputs for
                    `side_disabled_categories`; LD/CTP-tellerne under er
                    separate fordi de styrer antall-slots, ikke ja/nei. */}
                <SideCategoriesPicker
                  defaultDisabledCategories={initialDisabledCategories}
                  locked={lockSideTournament}
                />

                <fieldset>
                  <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                    Antall longest-drive-vinnere
                  </legend>
                  <div className="mt-2 flex gap-2">
                    {[0, 1, 2].map((n) => (
                      <label key={n} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="side_ld_count"
                          value={n}
                          defaultChecked={initialLdCount === n}
                          disabled={lockSideTournament}
                        />
                        <span className="font-serif text-base text-text tabular-nums">{n}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                    Antall closest-to-pin-vinnere
                  </legend>
                  <div className="mt-2 flex gap-2">
                    {[0, 1, 2].map((n) => (
                      <label key={n} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="side_ctp_count"
                          value={n}
                          defaultChecked={initialCtpCount === n}
                          disabled={lockSideTournament}
                        />
                        <span className="font-serif text-base text-text tabular-nums">{n}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {lockSideTournament && (
                  <p className="text-xs text-muted">
                    <strong>Kan ikke endres etter spill-start.</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        </fieldset>
      </section>

      {/* Section 2: Players */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-text">
            2. Spillere
          </h2>
          {/* Counter er mode-aware: best-ball viser «X av 8», solo viser
              kun antall valgte (ingen øvre tak). Holder dagens kjent
              «X av 8»-mønster mens vi forbereder mer fleksible modi. */}
          {requiresTeams ? (
            <span
              className={`text-xs font-medium tabular-nums ${eightSelected ? 'text-primary' : 'text-muted'}`}
            >
              {selectedPlayerIds.length} av 8 spillere valgt
            </span>
          ) : (
            <span
              className={`text-xs font-medium tabular-nums ${selectedPlayerIds.length > 0 ? 'text-primary' : 'text-muted'}`}
            >
              {selectedPlayerIds.length}{' '}
              {selectedPlayerIds.length === 1 ? 'spiller' : 'spillere'} valgt
            </span>
          )}
        </div>
        {players.length === 0 ? (
          <p className="text-sm text-muted">
            Ingen registrerte spillere ennå.
          </p>
        ) : (
          <>
            {/* Chips for valgte spillere — alltid synlig ABOVE søkefeltet
                slik at admin ikke mister oversikten når søk filtrerer
                listen under. Tab-rekkefølge: chips først (ÆØÅ-disiplin:
                avvelg via trykk), så søkefeltet, så filtrert liste. */}
            {selectedPlayerIds.length > 0 && (
              <ul
                aria-label="Valgte spillere"
                className="flex flex-wrap gap-2"
              >
                {selectedPlayerIds.map((pid) => {
                  const p = players.find((x) => x.id === pid);
                  if (!p) return null;
                  return (
                    <li key={pid}>
                      <button
                        type="button"
                        onClick={() => togglePlayer(pid)}
                        aria-label={`Fjern ${shortName(p)} fra spill`}
                        className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-1.5 rounded-full border border-primary bg-primary-soft text-sm text-text hover:bg-primary/15 transition-colors"
                      >
                        <span className="max-w-[14ch] truncate">
                          {shortName(p)}
                        </span>
                        <span aria-hidden="true" className="text-base leading-none text-muted">
                          ×
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Søkefelt — substring-match (case-insensitive) på
                navn/nickname/email. Inputen er en standard <input>; ingen
                downshift/cmdk eller andre deps. min-h sikrer ≥44px
                tap-target på mobil. */}
            <div>
              <label htmlFor="player_search" className="sr-only">
                Søk i spillere
              </label>
              <input
                id="player_search"
                type="search"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Søk i spillere…"
                aria-label="Søk i spillere"
                autoComplete="off"
                className="w-full min-h-[44px] rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
              />
            </div>

            {filteredPlayers.length === 0 ? (
              <p className="text-sm text-muted px-1">
                {playerSearch.trim() === ''
                  ? 'Alle spillere er valgt.'
                  : 'Ingen treff på søket.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredPlayers.map((p) => {
                  // Cap-en på 8 gjelder kun for moduser med fast roster
                  // (best-ball-netto i v1). Solo-stableford har ingen
                  // øvre grense på antall spillere — admin kan invitere
                  // hele klubben.
                  const atCap = requiresTeams && selectedPlayerIds.length >= 8;
                  return (
                    <li key={p.id}>
                      <label
                        className={`flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl border transition-colors border-border ${atCap ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={atCap}
                          onChange={() => togglePlayer(p.id)}
                          aria-label={`${playerLabel(p)}${p.pending ? ' — venter på å fullføre profil' : ''}`}
                          className="h-5 w-5 rounded border-border text-primary focus:ring-accent/40"
                        />
                        <span className="flex-1 min-w-0 truncate text-sm text-text">
                          {playerLabel(p)}
                        </span>
                        {p.pending && (
                          <StatusChip tone="påmelding" label="Venter" className="shrink-0" />
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Section 2.5: Modus + lagstørrelse — fyrer mellom spiller-listen og
          lag-tilordnings-grid-en så admin må eksplisitt velge hvordan
          spillet skal scoreres FØR det blir aktuelt å fordele lag.
          Lock-flagget gjelder edit-flyten for publiserte spill (backend
          mode-lock-guard har siste ord). */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-text">
          3. Format
        </h2>
        <ModeSelector
          value={gameMode}
          onChange={handleModeChange}
          disabled={lockGameMode}
        />
        <TeamSizeSelector
          mode={gameMode}
          value={teamSize}
          onChange={setTeamSize}
          disabled={lockGameMode}
        />
        {lockGameMode && (
          <p className="text-xs text-muted">
            <strong>Kan ikke endres etter spill-start.</strong>
          </p>
        )}
      </section>

      {/* Section 4: Teams — kun for team-modi (teamSize ≥ 2). Solo-stableford
          hopper over hele seksjonen siden det ikke finnes lag å fordele. */}
      {requiresTeams && eightSelected && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            4. Lag
          </h2>
          <p className="text-xs text-muted">
            4 lag à 2 spillere. Trekk tilfeldig eller velg manuelt.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={drawRandomTeams}
              className="flex-1 text-sm"
            >
              Trekk tilfeldig
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={clearTeams}
              className="flex-1 text-sm"
            >
              Tøm lag
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEAM_NUMBERS.map((team) => (
              <div
                key={team}
                className="border border-border rounded-lg p-3 space-y-2"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Lag {team}
                </p>
                {[0, 1].map((slotIndex) => {
                  const slot = slotIndex as 0 | 1;
                  const occupant = playersByTeam[team][slot];
                  const options = slotOptions(team, slot);
                  return (
                    <select
                      key={slot}
                      value={occupant ?? ''}
                      onChange={(e) =>
                        assignPlayerToSlot(team, slot, e.target.value)
                      }
                      className="w-full rounded-xl border px-3 py-2 bg-surface text-sm text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
                    >
                      <option value="">— Tom plass —</option>
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {shortName(p)}
                        </option>
                      ))}
                    </select>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 5: Flights — krever team-modus + fullført lag-fordeling. */}
      {requiresTeams && teamsComplete && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            5. Flights
          </h2>
          <p className="text-xs text-muted">
            Standard: lag 1 + 2 = flight 1, lag 3 + 4 = flight 2. Endre per
            spiller om dere spiller i flere flighter.
          </p>
          <div className="space-y-2">
            {TEAM_NUMBERS.flatMap((team) =>
              playersByTeam[team].map((pid) => {
                const p = players.find((x) => x.id === pid)!;
                const flight = flightByPlayer[pid] ?? teamDefaultFlight(team);
                return (
                  <div
                    key={pid}
                    className="flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg border border-border"
                  >
                    <span className="text-xs text-muted w-12 shrink-0">
                      Lag {team}
                    </span>
                    <span className="text-sm text-text flex-1 truncate">
                      {shortName(p)}
                    </span>
                    <div className="flex gap-1" role="group" aria-label="Tee for spiller">
                      {(['M', 'D', 'J'] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            setPlayerGenders((prev) => ({ ...prev, [pid]: g }))
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                            (playerGenders[pid] ?? 'M') === g
                              ? g === 'M'
                                ? 'bg-primary text-white dark:text-bg'
                                : g === 'D'
                                  ? 'bg-accent text-text'
                                  : 'bg-muted text-text'
                              : 'bg-surface border border-border text-muted hover:text-text'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                      <input
                        type="hidden"
                        name={`player_${pid}_gender`}
                        value={playerGenders[pid] ?? 'M'}
                      />
                    </div>
                    <select
                      value={flight}
                      onChange={(e) =>
                        setFlightForPlayer(pid, Number(e.target.value))
                      }
                      className="rounded-xl border px-2 py-1.5 bg-surface text-sm text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
                    >
                      {FLIGHT_NUMBERS.map((f) => (
                        <option key={f} value={f}>
                          Flight {f}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }),
            )}
          </div>
        </section>
      )}

      {/* Per-spiller-tee for solo-modus — flights-seksjonen rendrer ikke
          for stableford, så vi trenger en egen lett-vektsvariant slik at
          admin kan sette tee per spiller. Vises kun når det faktisk er
          spillere å konfigurere. */}
      {!requiresTeams && selectedPlayerIds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            4. Tee per spiller
          </h2>
          <p className="text-xs text-muted">
            Velg tee per spiller. M = herre, D = dame, J = junior.
          </p>
          <div className="space-y-2">
            {selectedPlayerIds.map((pid) => {
              const p = players.find((x) => x.id === pid);
              if (!p) return null;
              return (
                <div
                  key={pid}
                  className="flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg border border-border"
                >
                  <span className="text-sm text-text flex-1 truncate">
                    {shortName(p)}
                  </span>
                  <div className="flex gap-1" role="group" aria-label="Tee for spiller">
                    {(['M', 'D', 'J'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setPlayerGenders((prev) => ({ ...prev, [pid]: g }))
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          (playerGenders[pid] ?? 'M') === g
                            ? g === 'M'
                              ? 'bg-primary text-white dark:text-bg'
                              : g === 'D'
                                ? 'bg-accent text-text'
                                : 'bg-muted text-text'
                            : 'bg-surface border border-border text-muted hover:text-text'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                    <input
                      type="hidden"
                      name={`player_${pid}_gender`}
                      value={playerGenders[pid] ?? 'M'}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 6: Settings */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-text">
          6. Innstillinger
        </h2>
        <Input
          id="hcp_allowance_pct"
          name="hcp_allowance_pct"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          label="HCP-allowance %"
          value={hcpAllowance}
          onChange={(e) => setHcpAllowance(e.target.value)}
          hint="100 = fullt course handicap (standard). 85 = WHS fourball-tillegg."
          required
        />

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="require_peer_approval"
            checked={requirePeerApproval}
            onChange={(e) => setRequirePeerApproval(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-border text-primary focus:ring-accent/40"
          />
          <span>
            <span className="block text-sm font-medium text-text">
              Krev peer-godkjenning
            </span>
            <span className="block text-xs text-muted mt-0.5">
              Hvis på, må en annen i flighten godkjenne scorekortet før
              innsending.
            </span>
          </span>
        </label>
      </section>

      {/* Section 6: Submit */}
      <section className="space-y-3 pt-2">
        {mode.kind === 'edit-scheduled' && (
          // The game is already 'scheduled', so there's no draft/publish
          // split — just a single save button. Tee-off is required (same
          // gate as publish) since you can't un-set a tee-off on a scheduled
          // game.
          <Button
            type="submit"
            formAction={mode.updateAction.bind(null, mode.gameId)}
            className="w-full"
            disabled={!canPublish}
          >
            Lagre endringer
          </Button>
        )}

        {draftPublishActions && (
          // Both 'create' and 'edit-draft' share the same publish/draft
          // contract. The helper above resolves the right pair of server
          // actions per mode; the JSX below stays mode-agnostic.
          <>
            <Button
              type="submit"
              formAction={draftPublishActions.publish}
              className="w-full"
              disabled={!canPublish}
              aria-describedby={
                !canPublish && missingForPublish.length > 0
                  ? 'publish-missing'
                  : undefined
              }
            >
              Publiser
            </Button>
            {!canPublish && missingForPublish.length > 0 && (
              <p
                id="publish-missing"
                className="text-xs text-muted text-center"
              >
                Mangler: {missingForPublish.join(', ')}
              </p>
            )}
            <Button
              type="submit"
              variant="secondary"
              formAction={draftPublishActions.draft}
              formNoValidate
              className="w-full"
              disabled={name.trim() === ''}
            >
              Lagre utkast
            </Button>
          </>
        )}
      </section>
    </form>
  );
}
