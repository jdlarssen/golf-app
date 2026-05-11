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
  name: string;
  nickname: string | null;
  hcp_index: number;
};

const TEAM_NUMBERS = [1, 2, 3, 4] as const;
type TeamNumber = (typeof TEAM_NUMBERS)[number];

export type InitialValues = {
  name?: string;
  course_id?: string;
  tee_box_id?: string;
  scheduled_tee_off_at?: string;
  hcp_allowance_pct?: string;
  require_peer_approval?: boolean;
  players?: Array<{
    user_id: string;
    team_number: TeamNumber;
    flight_number: number;
  }>;
};

type Props = {
  courses: CourseOption[];
  players: PlayerOption[];
  createDraftAction: (formData: FormData) => void | Promise<void>;
  createAndStartAction: (formData: FormData) => void | Promise<void>;
  initialValues?: InitialValues;
};

const FLIGHT_NUMBERS = [1, 2, 3, 4] as const;

// Derive team/flight maps from the optional initialValues.players array so the
// edit page (D4) can pre-fill these without re-implementing the math.
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
    teamByPlayer[row.user_id] = row.team_number;
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

export function GameForm({
  courses,
  players,
  createDraftAction,
  createAndStartAction,
  initialValues,
}: Props) {
  // `name` is controlled now (was uncontrolled) so initialValues can pre-fill
  // it on the edit page (D4). Default to '' when not provided.
  const [name, setName] = useState<string>(initialValues?.name ?? '');
  const [courseId, setCourseId] = useState<string>(
    initialValues?.course_id ?? '',
  );
  const [teeBoxId, setTeeBoxId] = useState<string>(
    initialValues?.tee_box_id ?? '',
  );
  // Required for "Lagre og publiser" (D2 wires this into button disabled
  // state). Drafts may omit it. Empty string === "not set".
  const [scheduledTeeOffAt, setScheduledTeeOffAt] = useState<string>(
    initialValues?.scheduled_tee_off_at ?? '',
  );
  const initialAssignments = useMemo(
    () => deriveAssignmentsFromInitial(initialValues),
    [initialValues],
  );
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

  // Flag exposed for D2 to drive the "Lagre og publiser" button's disabled
  // state. Drafts can be saved without a tee-off; publishing cannot.
  const hasTeeOff = scheduledTeeOffAt !== '';
  void hasTeeOff;

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

  // The serialized payload sent to the server action. Order is stable so the
  // server's `player_${i}_*` schema is deterministic.
  const orderedPayload = useMemo(() => {
    if (!teamsComplete) return [];
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
  }, [teamsComplete, playersByTeam, flightByPlayer]);

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

  const canSubmit =
    courseId !== '' &&
    teeBoxId !== '' &&
    eightSelected &&
    teamsComplete &&
    flightsComplete &&
    allowanceValid;

  function playerLabel(p: PlayerOption): string {
    const hcp = p.hcp_index.toFixed(1);
    if (p.nickname) return `${p.name} «${p.nickname}» — HCP ${hcp}`;
    return `${p.name} — HCP ${hcp}`;
  }

  function shortName(p: PlayerOption): string {
    return p.nickname ? `${p.name} «${p.nickname}»` : p.name;
  }

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
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
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
            className="w-full rounded-lg border px-3.5 py-2.5 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-green-600"
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
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5"
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
            className="w-full rounded-lg border px-3.5 py-2.5 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-green-600 disabled:opacity-50"
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
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            2. Spillere
          </h2>
          <span
            className={`text-xs font-medium ${eightSelected ? 'text-green-700 dark:text-green-400' : 'text-zinc-500'}`}
          >
            {selectedPlayerIds.length} av 8 spillere valgt
          </span>
        </div>
        {players.length === 0 ? (
          <p className="text-sm text-zinc-500">
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
                    className={`flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg border ${checked ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : 'border-zinc-200 dark:border-zinc-800'} ${atCap ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() => togglePlayer(p.id)}
                      className="h-5 w-5 rounded border-zinc-300 text-green-600 focus:ring-green-600"
                    />
                    <span className="text-sm text-zinc-900 dark:text-zinc-100">
                      {playerLabel(p)}
                    </span>
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
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            3. Lag
          </h2>
          <p className="text-xs text-zinc-500">
            4 lag à 2 spillere. Trekk tilfeldig eller velg manuelt.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={drawRandomTeams}
              className="flex-1 min-h-[44px] text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg px-4 py-2.5 transition-colors"
            >
              Trekk tilfeldig
            </button>
            <button
              type="button"
              onClick={clearTeams}
              className="flex-1 min-h-[44px] text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg px-4 py-2.5 transition-colors"
            >
              Tøm lag
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEAM_NUMBERS.map((team) => (
              <div
                key={team}
                className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 space-y-2"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
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
                      className="w-full rounded-lg border px-3 py-2 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-green-600"
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
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            4. Flights
          </h2>
          <p className="text-xs text-zinc-500">
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
                    className="flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800"
                  >
                    <span className="text-xs text-zinc-500 w-12 shrink-0">
                      Lag {team}
                    </span>
                    <span className="text-sm text-zinc-900 dark:text-zinc-100 flex-1 truncate">
                      {shortName(p)}
                    </span>
                    <select
                      value={flight}
                      onChange={(e) =>
                        setFlightForPlayer(pid, Number(e.target.value))
                      }
                      className="rounded-lg border px-2 py-1.5 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-green-600"
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
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
            className="mt-0.5 h-5 w-5 rounded border-zinc-300 text-green-600 focus:ring-green-600"
          />
          <span>
            <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Krev peer-godkjenning
            </span>
            <span className="block text-xs text-zinc-500 mt-0.5">
              Hvis på, må en annen i flighten godkjenne scorekortet før
              innsending.
            </span>
          </span>
        </label>
      </section>

      {/* Section 6: Submit */}
      <section className="space-y-3 pt-2">
        <Button
          type="submit"
          formAction={createAndStartAction}
          className="w-full"
          disabled={!canSubmit}
        >
          Lagre og start
        </Button>
        <Button
          type="submit"
          variant="secondary"
          formAction={createDraftAction}
          className="w-full"
          disabled={!canSubmit}
        >
          Lagre som utkast
        </Button>
      </section>
    </form>
  );
}
