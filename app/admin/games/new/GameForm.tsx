'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export type CourseOption = {
  id: string;
  name: string;
  tee_boxes: { id: string; name: string }[];
};

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
  players?: Array<{
    user_id: string;
    // Widened to `number` at the prop boundary; deriveAssignmentsFromInitial
    // validates/narrows to TeamNumber when populating internal state.
    team_number: number;
    flight_number: number;
  }>;
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
// with an out-of-range team_number are dropped (treated as unassigned),
// which keeps the prop boundary forgiving without smuggling bad data into
// internal state.
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
    if (isTeamNumber(row.team_number)) {
      teamByPlayer[row.user_id] = row.team_number;
    }
    flightByPlayer[row.user_id] = row.flight_number;
  }
  return { selectedPlayerIds, teamByPlayer, flightByPlayer };
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
  // Required for "Lagre og publiser"; drives the button's disabled state via
  // `canPublish` below. Drafts may omit it. Empty string === "not set".
  const [scheduledTeeOffAt, setScheduledTeeOffAt] = useState<string>(
    initialValues?.scheduled_tee_off_at ?? '',
  );
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

  // Drafts can be saved without a tee-off; publishing cannot. `canPublish`
  // below combines this with the rest of the validity gates.
  const hasTeeOff = scheduledTeeOffAt !== '';

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId],
  );

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

  // Find the first lag with fewer than 2 players, scanning 1 → 4. Used when
  // a player is newly checked: they auto-fill the next available slot so
  // partial-draft rosters round-trip through the DB (server requires
  // team_number 1..4 per row).
  function nextAvailableTeam(
    teamMap: Record<string, TeamNumber>,
  ): TeamNumber {
    const counts: Record<TeamNumber, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const team of Object.values(teamMap)) {
      counts[team] += 1;
    }
    for (const t of TEAM_NUMBERS) {
      if (counts[t] < 2) return t;
    }
    return 1; // Unreachable when invoked from togglePlayer (caller guards on length < 8).
  }

  function togglePlayer(playerId: string) {
    setSelectedPlayerIds((prev) => {
      if (prev.includes(playerId)) {
        // Removing also clears their team/flight assignment so state stays consistent.
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
      if (prev.length >= 8) return prev;
      // Auto-assign new selection to the next available lag slot (lag 1
      // slot 0 → lag 1 slot 1 → lag 2 slot 0 → …). Required because every
      // game_players row needs a valid team_number 1..4 — a "checked but
      // unassigned" player would be filtered out of orderedPayload and
      // never reach the DB, leaving partial drafts silently empty.
      // Admin can rearrange via the slot dropdowns once 8 are selected,
      // or reshuffle with «Trekk lag tilfeldig».
      setTeamByPlayer((tp) => {
        const team = nextAvailableTeam(tp);
        setFlightByPlayer((fp) => ({
          ...fp,
          [playerId]: teamDefaultFlight(team),
        }));
        return { ...tp, [playerId]: team };
      });
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

  // The serialized payload sent to the server action. Always includes every
  // player who has a team assignment, even if teams aren't fully balanced —
  // drafts need to round-trip partial rosters. Players selected but not yet
  // placed in a lag are excluded (their team_number is undefined, so they're
  // already filtered out of `playersByTeam`). The publish button is
  // independently gated by `canPublish`, so this can't smuggle an
  // unbalanced roster into a published game.
  // Order is stable so the server's `player_${i}_*` schema is deterministic.
  const orderedPayload = useMemo(() => {
    const rows: { user_id: string; team_number: TeamNumber; flight_number: number }[] = [];
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
  }, [playersByTeam, flightByPlayer]);

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

  // Publishing requires every section to be valid AND a tee-off time. Drafts
  // skip these gates entirely (they only need a name). Previously this was
  // split into a `canSubmit` step, but nothing else referenced that helper
  // once «Lagre utkast» dropped to name-only — inlined for clarity.
  const canPublish =
    courseId !== '' &&
    teeBoxId !== '' &&
    eightSelected &&
    teamsComplete &&
    flightsComplete &&
    allowanceValid &&
    hasTeeOff;

  // Human-readable list of what's still missing for a publish. Used as helper
  // text under the disabled «Publiser»-button. Order mirrors the form
  // sections so the message scans top-to-bottom.
  const missingForPublish: string[] = [];
  if (courseId === '') missingForPublish.push('bane');
  if (teeBoxId === '') missingForPublish.push('tee-boks');
  if (!hasTeeOff) missingForPublish.push('tee-off-tid');
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
      {/* Hidden inputs that carry the structured assignment payload. The server
          action only ever sees the FormData; keeping the names server-known
          means we don't need an alternate JSON wire format. */}
      {orderedPayload.map((row, i) => (
        <div key={row.user_id} className="hidden">
          <input type="hidden" name={`player_${i}_id`} value={row.user_id} />
          <input
            type="hidden"
            name={`player_${i}_team`}
            value={row.team_number}
          />
          <input
            type="hidden"
            name={`player_${i}_flight`}
            value={row.flight_number}
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
          <label
            htmlFor="tee_box_id"
            className="block text-sm font-medium text-text mb-1.5"
          >
            Tee-boks
          </label>
          <select
            id="tee_box_id"
            name="tee_box_id"
            value={teeBoxId}
            onChange={(e) => setTeeBoxId(e.target.value)}
            disabled={!selectedCourse}
            required
            className="w-full rounded-xl border px-3.5 py-2.5 bg-surface text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
          >
            <option value="">
              {selectedCourse ? 'Velg tee-boks…' : 'Velg bane først'}
            </option>
            {availableTees.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
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
      </section>

      {/* Section 2: Players */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-text">
            2. Spillere
          </h2>
          <span
            className={`text-xs font-medium tabular-nums ${eightSelected ? 'text-primary' : 'text-muted'}`}
          >
            {selectedPlayerIds.length} av 8 spillere valgt
          </span>
        </div>
        {players.length === 0 ? (
          <p className="text-sm text-muted">
            Ingen registrerte spillere ennå.
          </p>
        ) : (
          <ul className="space-y-2">
            {players.map((p) => {
              const checked = selectedPlayerIds.includes(p.id);
              const atCap = !checked && selectedPlayerIds.length >= 8;
              return (
                <li key={p.id}>
                  <label
                    className={`flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl border transition-colors ${checked ? 'border-primary bg-primary-soft' : 'border-border'} ${atCap ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() => togglePlayer(p.id)}
                      className="h-5 w-5 rounded border-border text-primary focus:ring-accent/40"
                    />
                    <span className="flex-1 text-sm text-text">
                      {playerLabel(p)}
                    </span>
                    {p.pending && (
                      <span
                        className="shrink-0 rounded-full px-[7px] py-[3px] font-sans text-[9.5px] font-semibold uppercase"
                        style={{
                          letterSpacing: '0.16em',
                          background: 'rgba(216, 155, 58, 0.18)',
                          color: '#7a5410',
                        }}
                      >
                        Venter
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Section 3: Teams */}
      {eightSelected && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            3. Lag
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

      {/* Section 4: Flights */}
      {teamsComplete && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            4. Flights
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

      {/* Section 5: Settings */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-text">
          5. Innstillinger
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
