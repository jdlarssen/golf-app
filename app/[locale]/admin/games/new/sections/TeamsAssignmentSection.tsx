'use client';

/**
 * TeamsAssignmentSection — alt som kommer ETTER spiller-velgeren og FØR
 * advanced-innstillingene.
 *
 * Ansvar: per modus rendrer denne seksjonen relevante under-blokker:
 *  - matchplay → sider-grid (side 1 + side 2)
 *  - best-ball-netto → lag-grid (opptil 20 par) + «Trekk tilfeldig»/«Tøm lag» + flights
 *  - par-stableford → lag-grid (opptil 20 par) + «Trekk tilfeldig»/«Tøm lag» + per-spiller-tee
 *  - scramble-familien (texas/ambrose/florida/shamble) → lag-grid (2–4 per lag
 *    for texas/ambrose, 3–4 for florida/shamble, jf. TEAM_FORMAT_TEAM_SIZES;
 *    antall lagkort vokser med valgte spillere, jf. `teamGridShape`, #2148, #2079)
 *    + «Trekk tilfeldig»/«Tøm lag» + per-spiller-tee (#2012)
 *  - patsome / lag-matchplay → lag-grid + «Tøm lag», ingen trekning
 *  - solo (stableford / solo strokeplay) → kun per-spiller-tee
 *
 * Nummerering speiler GameForm-stacked-layouten («4. Lag», «5. Flights»,
 * «5. Tee per spiller»). Wizard-en kan be om å droppe det nummeriske
 * prefiket via `hideNumbering`-flagget — wizard-stegene har sin egen
 * stepper-tittel.
 */

import { useTranslations } from 'next-intl';
import type { PlayerOption } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { Button } from '@/components/ui/Button';
import {
  maxTeamsForSize,
  teamGridShape,
  teamNumberRange,
} from '@/lib/games/teamFormatLimits';

type Props = {
  state: GameFormState;
  players: PlayerOption[];
  /**
   * Når true, dropper «4. »/«5. »-prefikser i headings. Wizard-en bruker
   * stepper-header for nummerering, så heading-en blir kun «Lag»/«Sider»
   * inne i wizard-stegene.
   */
  hideNumbering?: boolean;
};

/**
 * M/D/J-kategorivelger for én spiller. Brukt to steder (flight-grid og
 * tee-per-spiller), så logikken for å disable en kategori tee-en mangler
 * rating for (#721) bor ett sted. En utilgjengelig kategori er `disabled`
 * med en forklarende `title`; klem-ved-tee-bytte i hooken sørger for at
 * ingen spiller står igjen på en utilgjengelig kategori.
 */
function PlayerGenderToggle({
  pid,
  playerGenders,
  setPlayerGenders,
  teeGenderAvailability,
  ariaLabel,
  unavailableTitle,
}: {
  pid: string;
  playerGenders: GameFormState['playerGenders'];
  setPlayerGenders: GameFormState['setPlayerGenders'];
  teeGenderAvailability: GameFormState['teeGenderAvailability'];
  ariaLabel: string;
  unavailableTitle: string;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label={ariaLabel}>
      {(['M', 'D', 'J'] as const).map((g) => {
        const unavailable = !teeGenderAvailability[g];
        const selected = (playerGenders[pid] ?? 'M') === g;
        return (
          <button
            key={g}
            type="button"
            disabled={unavailable}
            title={unavailable ? unavailableTitle : undefined}
            onClick={() =>
              setPlayerGenders((prev) => ({ ...prev, [pid]: g }))
            }
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              unavailable
                ? 'bg-surface border border-border text-muted/40 cursor-not-allowed'
                : selected
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
        );
      })}
      <input
        type="hidden"
        name={`player_${pid}_gender`}
        value={playerGenders[pid] ?? 'M'}
      />
    </div>
  );
}

/**
 * #909: forteller om TeamsAssignmentSection vil rendre noe innhold for
 * gjeldende state. GameForm bruker den til å bestemme om «Inndeling»-
 * Disclosure-panelet skal vises i det hele tatt (et tomt panel ville vært
 * forvirrende). MÅ speile de fire render-guardene i komponenten under (sider /
 * lag-grid / flights / tee-per-spiller) — endrer du en guard, oppdater begge.
 */
export function teamsAssignmentHasContent(state: GameFormState): boolean {
  const n = state.selectedPlayerIds.length;
  // Sider (matchplay)
  if (state.isMatchplay && n > 0) return true;
  // Lag-grid
  if (
    state.requiresTeams &&
    (((state.isBestBall ||
      state.isParStableford ||
      state.isPatsome ||
      state.isTeamMatchplay) &&
      n >= 2) ||
      ((state.isTexas ||
        state.isAmbrose ||
        state.isFlorida ||
        state.isShamble) &&
        n >= state.teamSize))
  ) {
    return true;
  }
  // Flights (best-ball, fullt fordelt)
  if (state.isBestBall && state.teamsComplete) return true;
  // Tee-per-spiller
  if (
    (state.isSolo ||
      state.isParStableford ||
      state.isMatchplay ||
      state.isTexas ||
      state.isAmbrose ||
      state.isFlorida ||
      state.isShamble ||
      state.isPatsome ||
      state.isTeamMatchplay) &&
    n > 0
  ) {
    return true;
  }
  return false;
}

export function TeamsAssignmentSection({
  state,
  players,
  hideNumbering = false,
}: Props) {
  const t = useTranslations('wizard.sections.teams');
  const tPlayers = useTranslations('wizard.sections.players');
  const pendingLabel = tPlayers('pendingLabel');

  function shortName(p: PlayerOption): string {
    if (p.pending) return p.email ?? pendingLabel;
    const displayName = p.name ?? p.email ?? pendingLabel;
    return p.nickname ? `${displayName} «${p.nickname}»` : displayName;
  }
  const {
    gameMode,
    selectedPlayerIds,
    teamByPlayer,
    flightByPlayer,
    playerGenders,
    setPlayerGenders,
    teeGenderAvailability,
    playersByTeam,
    teamsComplete,
    isSolo,
    isBestBall,
    isParStableford,
    isMatchplay,
    isTexas,
    isAmbrose,
    isFlorida,
    isShamble,
    isPatsome,
    isTeamMatchplay,
    requiresTeams,
    teamSize,
    canDrawRandomTeams,
    drawRandomTeams,
    clearTeams,
    assignPlayerToSlot,
    assignPlayerToSide,
    setFlightForPlayer,
    slotOptions,
    teamDefaultFlight,
  } = state;

  const numberPrefix = (n: string) => (hideNumbering ? '' : `${n}. `);
  // Tee-per-spiller-seksjonen får 5. når matchplay/par/texas (siden 4. Lag er over),
  // ellers 4. for solo. Wizard hopper over prefiket helt.
  const teePerPlayerPrefix = hideNumbering
    ? ''
    : isParStableford ||
        isMatchplay ||
        isTexas ||
        isAmbrose ||
        isFlorida ||
        isShamble ||
        isPatsome ||
        isTeamMatchplay
      ? '5. '
      : '4. ';

  // Lagnumre med spillere, stigende. Brukes av flight-seksjonen og for å
  // holde et lag med spillere synlig selv om rutenettet ellers ville krympet.
  const teamsWithPlayers = Object.keys(playersByTeam)
    .map(Number)
    .filter((team) => playersByTeam[team].length > 0)
    .sort((a, b) => a - b);
  const highestTeamWithPlayers = teamsWithPlayers.at(-1) ?? 0;
  // Plasser per lagkort og antall lagkort bor i `teamGridShape` (#2079), samme
  // regel som hooken løser spillere mot når formen krymper. #2148: rutenettet
  // vokser med valgte spillere, og et lag som alt har spillere vises alltid —
  // 13 lag trukket à 3 og så byttet til à 4 skal ikke skjule lag 11–13.
  // Lag-matchplay er 2v2 og har alltid to sider.
  const { slotsPerTeam: slotCount, teamCount: gridTeamCount } = teamGridShape(
    gameMode,
    teamSize,
    selectedPlayerIds.length,
    highestTeamWithPlayers,
  );
  // Best ball: to par per flight, så flight-valgene går til flighten det
  // høyeste laget hører hjemme i — eller høyere hvis arrangøren alt har
  // flyttet noen dit.
  const highestChosenFlight = Math.max(
    0,
    ...teamsWithPlayers.flatMap((team) =>
      playersByTeam[team].map((pid) => flightByPlayer[pid] ?? 0),
    ),
  );
  const flightOptions = teamNumberRange(
    Math.max(1, Math.ceil(highestTeamWithPlayers / 2), highestChosenFlight),
  );

  function teamsDescription(): string {
    if (isTeamMatchplay) return t('teamsDescTeamMatchplay');
    const maxTeams = maxTeamsForSize(slotCount);
    if (isParStableford) return t('teamsDescParStableford', { maxTeams });
    if (isTexas || isAmbrose || isFlorida) {
      if (teamSize === 2) return t('teamsDescTexas2', { maxTeams });
      if (teamSize === 3) return t('teamsDescTexas3', { maxTeams });
      return t('teamsDescTexas4', { maxTeams });
    }
    if (isShamble) {
      if (teamSize === 3) return t('teamsDescShamble3', { maxTeams });
      return t('teamsDescShamble4', { maxTeams });
    }
    if (isPatsome) return t('teamsDescPatsome', { maxTeams });
    return t('teamsDescBestBall', { maxTeams });
  }

  return (
    <>
      {/* Section 4 — Matchplay: side-tilordning. Vises så snart admin har
          valgt minst én spiller (slik at admin kan tilordne side mens
          spiller-listen fylles ut). Med 0 spillere vises seksjonen ikke
          siden det ikke er noen å plassere ennå. Lag/flight-grid-en for
          team-modi sitter rett under og rendres aldri for matchplay. */}
      {isMatchplay && selectedPlayerIds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            {numberPrefix('4')}{t('sidesHeading')}
          </h2>
          <p className="text-xs text-muted">
            {t('sidesDescription')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([1, 2] as const).map((side) => {
              const occupant = selectedPlayerIds.find(
                (pid) => teamByPlayer[pid] === side,
              );
              // Dropdownen viser nåværende okkupant + alle ufordelte
              // spillere + spilleren på den ANDRE siden (så admin kan
              // bytte uten å først nullstille). assignPlayerToSide gjør
              // bytte/swap basert på hvor spilleren stod fra før.
              const options = selectedPlayerIds
                .filter((pid) => pid === occupant || teamByPlayer[pid] !== side)
                .map((pid) => players.find((p) => p.id === pid))
                .filter((p): p is PlayerOption => p !== undefined);
              return (
                <div
                  key={side}
                  className="border border-border rounded-lg p-3 space-y-2"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {t('sideLabel', { side })}
                  </p>
                  <label
                    htmlFor={`matchplay_side_${side}`}
                    className="sr-only"
                  >
                    {t('sideSrLabel', { side })}
                  </label>
                  <select
                    id={`matchplay_side_${side}`}
                    value={occupant ?? ''}
                    onChange={(e) =>
                      assignPlayerToSide(side, e.target.value)
                    }
                    className="w-full rounded-xl border px-3 py-2 bg-surface text-sm text-text border-border focus:border-accent transition-[border-color,box-shadow] duration-150"
                  >
                    <option value="">{t('emptySlotOption')}</option>
                    {options.map((p) => (
                      <option key={p.id} value={p.id}>
                        {shortName(p)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 4: Teams — kun for team-modi (teamSize ≥ 2). Solo-stableford
          og matchplay hopper over hele seksjonen siden det ikke finnes lag
          å fordele (matchplay har sin egen side-tilordnings-seksjon over).
          Synlighet:
          - Best-ball: vises så snart admin har valgt minst 2 spillere
            (fleksibel partall-regel etter #374).
          - Par-stableford: vises så snart admin har valgt minst 2 spillere,
            siden lag-fordelingen skjer parallelt med spiller-valg (admin
            kan ha opptil 40 spillere på 20 lag, #2148). */}
      {requiresTeams &&
        ((isBestBall && selectedPlayerIds.length >= 2) ||
          (isParStableford && selectedPlayerIds.length >= 2) ||
          (isTexas && selectedPlayerIds.length >= teamSize) ||
          (isAmbrose && selectedPlayerIds.length >= teamSize) ||
          (isFlorida && selectedPlayerIds.length >= teamSize) ||
          (isShamble && selectedPlayerIds.length >= teamSize) ||
          (isPatsome && selectedPlayerIds.length >= 2) ||
          (isTeamMatchplay && selectedPlayerIds.length >= 2)) && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            {numberPrefix('4')}{t('teamsHeading')}
          </h2>
          <p className="text-xs text-muted">
            {teamsDescription()}
          </p>
          {/* «Trekk tilfeldig»/«Tøm lag» for best ball, par-stableford and the
              scramble family (#2012). The draw deals teams of the chosen size;
              the button is disabled while the count leaves a leftover or needs
              more teams than the player cap allows (`canDrawRandomTeams`). */}
          {(isBestBall || isParStableford || isTexas || isAmbrose || isFlorida || isShamble) && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={drawRandomTeams}
                disabled={!canDrawRandomTeams}
                data-testid="draw-random-teams"
                className="flex-1 text-sm"
              >
                {t('drawRandomButton')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={clearTeams}
                className="flex-1 text-sm"
              >
                {t('clearTeamsButton')}
              </Button>
            </div>
          )}
          {/* Patsome and team matchplay have no draw: clearing only, once
              someone is assigned. */}
          {(isPatsome || isTeamMatchplay) &&
            selectedPlayerIds.some((pid) => teamByPlayer[pid] !== undefined) && (
            <div className="flex">
              <Button
                type="button"
                variant="secondary"
                onClick={clearTeams}
                className="flex-1 text-sm"
              >
                {t('clearTeamsButton')}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {teamNumberRange(gridTeamCount).map((team) => {
              // Antall lagkort og plasser leses fra `teamFormatLimits`
              // (#2009, #2148), samme kilde som validatoren.
              return (
                <div
                  key={team}
                  data-testid={`team-card-${team}`}
                  className="border border-border rounded-lg p-3 space-y-2"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {isTeamMatchplay
                      ? t('sideTeamLabel', { team })
                      : t('teamLabel', { team })}
                  </p>
                  {Array.from({ length: slotCount }, (_, slotIndex) => {
                    const occupant = playersByTeam[team][slotIndex];
                    const options = slotOptions(team, slotIndex);
                    return (
                      <select
                        key={slotIndex}
                        value={occupant ?? ''}
                        onChange={(e) =>
                          assignPlayerToSlot(team, slotIndex, e.target.value)
                        }
                        className="w-full rounded-xl border px-3 py-2 bg-surface text-sm text-text border-border focus:border-accent transition-[border-color,box-shadow] duration-150"
                      >
                        <option value="">{t('emptySlotOption')}</option>
                        {options.map((p) => (
                          <option key={p.id} value={p.id}>
                            {shortName(p)}
                          </option>
                        ))}
                      </select>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 5: Flights — kun for best-ball (standard to par per flight,
          #2148). Par-stableford skipper denne seksjonen
          siden flight-tilordning auto-mapper til team_number i payloaden
          (par-stableford bruker ikke separate flighter). Solo har ingen
          lag/flight-konsept i det hele tatt. */}
      {isBestBall && teamsComplete && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            {numberPrefix('5')}{t('flightsHeading')}
          </h2>
          <p className="text-xs text-muted">
            {t('flightsDescription')}
          </p>
          <div className="space-y-2">
            {teamsWithPlayers.flatMap((team) =>
              playersByTeam[team].map((pid) => {
                const p = players.find((x) => x.id === pid)!;
                const flight = flightByPlayer[pid] ?? teamDefaultFlight(team);
                return (
                  <div
                    key={pid}
                    className="flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-lg border border-border"
                  >
                    <span className="text-xs text-muted w-12 shrink-0">
                      {t('teamBadge', { team })}
                    </span>
                    <span className="text-sm text-text flex-1 truncate">
                      {shortName(p)}
                    </span>
                    <PlayerGenderToggle
                      pid={pid}
                      playerGenders={playerGenders}
                      setPlayerGenders={setPlayerGenders}
                      teeGenderAvailability={teeGenderAvailability}
                      ariaLabel={t('teeGroupAriaLabel')}
                      unavailableTitle={t('categoryNotRated')}
                    />
                    <select
                      value={flight}
                      onChange={(e) =>
                        setFlightForPlayer(pid, Number(e.target.value))
                      }
                      className="rounded-xl border px-2 py-1.5 bg-surface text-sm text-text border-border focus:border-accent transition-[border-color,box-shadow] duration-150"
                    >
                      {flightOptions.map((f) => (
                        <option key={f} value={f}>
                          {t('flightLabel', { flight: f })}
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

      {/* Per-spiller-tee for solo-, par-stableford-, matchplay- og Texas-modus —
          flights-seksjonen rendrer ikke for disse, så vi trenger en egen
          lett-vekts-variant slik at admin kan sette tee per spiller.
          Matchplay krever individuell tee for korrekt slope/CR → course
          handicap → matchplay-stroke-allokering. Texas trenger det også for
          å regne riktig CH per medlem før NGF-aggregat-formelen kombinerer
          dem til lag-HCP. Vises kun når det faktisk er spillere å konfigurere.
          Best-ball håndterer tee inne i flights-seksjonen ovenfor. */}
      {(isSolo ||
        isParStableford ||
        isMatchplay ||
        isTexas ||
        isAmbrose ||
        isFlorida ||
        isShamble ||
        isPatsome ||
        isTeamMatchplay) &&
        selectedPlayerIds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            {teePerPlayerPrefix}{t('teePerPlayerHeading')}
          </h2>
          <p className="text-xs text-muted">
            {t('teePerPlayerDescription')}
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
                  <PlayerGenderToggle
                    pid={pid}
                    playerGenders={playerGenders}
                    setPlayerGenders={setPlayerGenders}
                    teeGenderAvailability={teeGenderAvailability}
                    ariaLabel={t('teeGroupAriaLabel')}
                    unavailableTitle={t('categoryNotRated')}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
