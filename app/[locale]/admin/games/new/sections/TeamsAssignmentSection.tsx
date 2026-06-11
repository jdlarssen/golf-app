'use client';

/**
 * TeamsAssignmentSection — alt som kommer ETTER spiller-velgeren og FØR
 * advanced-innstillingene.
 *
 * Ansvar: per modus rendrer denne seksjonen relevante under-blokker:
 *  - matchplay → sider-grid (side 1 + side 2)
 *  - best-ball-netto → lag-grid (4 lag à 2) + «Trekk tilfeldig»/«Tøm» + flights
 *  - par-stableford → lag-grid (1-4 lag à 2) + per-spiller-tee
 *  - texas-scramble → lag-grid (2 eller 4 spillere per lag) + per-spiller-tee
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
import { FLIGHT_NUMBERS, TEAM_NUMBERS, type TeamNumber } from '../useGameFormState';

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
    selectedPlayerIds,
    teamByPlayer,
    flightByPlayer,
    playerGenders,
    setPlayerGenders,
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
    requiresTeams,
    teamSize,
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
        isShamble
      ? '5. '
      : '4. ';

  function teamsDescription(): string {
    if (isParStableford) return t('teamsDescParStableford');
    if (isTexas || isAmbrose || isFlorida) {
      if (teamSize === 2) return t('teamsDescTexas2');
      if (teamSize === 3) return t('teamsDescTexas3');
      return t('teamsDescTexas4');
    }
    if (isShamble) {
      if (teamSize === 3) return t('teamsDescShamble3');
      return t('teamsDescShamble4');
    }
    return t('teamsDescBestBall');
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
                    className="w-full rounded-xl border px-3 py-2 bg-surface text-sm text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
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
            (fleksibel 2/4/6/8-regel etter #374 — ingen 8-krav).
          - Par-stableford: vises så snart admin har valgt minst 2 spillere,
            siden lag-fordelingen skjer parallelt med spiller-valg (admin
            kan ha 2/4/6/8 spillere på 1-4 lag). */}
      {requiresTeams &&
        ((isBestBall && selectedPlayerIds.length >= 2) ||
          (isParStableford && selectedPlayerIds.length >= 2) ||
          (isTexas && selectedPlayerIds.length >= teamSize) ||
          (isAmbrose && selectedPlayerIds.length >= teamSize) ||
          (isFlorida && selectedPlayerIds.length >= teamSize) ||
          (isShamble && selectedPlayerIds.length >= teamSize)) && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-text">
            {numberPrefix('4')}{t('teamsHeading')}
          </h2>
          <p className="text-xs text-muted">
            {teamsDescription()}
          </p>
          {/* «Trekk tilfeldig»/«Tøm lag» — best-ball støtter nå 2/4/6/8 spillere
              (#374); drawRandomTeams bruker det faktiske partall-antallet. */}
          {isBestBall && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={drawRandomTeams}
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
          {(isParStableford || isTexas || isAmbrose || isFlorida || isShamble) &&
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
            {TEAM_NUMBERS.map((team) => {
              // For Texas med team_size=4 har 8-spiller-limit i payload-laget
              // konsekvensen at maks 2 lag kan fylles (2×4=8). Skjul lag 3 og 4
              // for å unngå at admin tilordner spillere til et lag som ikke
              // kan publiseres. Best-ball og par-stableford fortsetter å vise
              // alle 4 lag uavhengig av lagstørrelse.
              if ((isTexas || isAmbrose || isFlorida) && teamSize === 4 && team > 2) return null;
              if (isFlorida && teamSize === 3 && team > 2) return null;
              // Shamble med team_size=4 har samme 8-slots-logikk som Texas:
              // maks 2 lag á 4 = 8 spillere. Shamble med team_size=3 viser
              // alle 4 lag siden max er 4×3=12 (skiller seg fra Florida-3,
              // som kun bruker 2 lag).
              if (isShamble && teamSize === 4 && team > 2) return null;
              const slotCount =
                isTexas || isAmbrose || isFlorida || isShamble ? teamSize : 2;
              return (
                <div
                  key={team}
                  className="border border-border rounded-lg p-3 space-y-2"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {t('teamLabel', { team })}
                  </p>
                  {Array.from({ length: slotCount }, (_, slotIndex) => {
                    const occupant = playersByTeam[team as TeamNumber][slotIndex];
                    const options = slotOptions(team as TeamNumber, slotIndex);
                    return (
                      <select
                        key={slotIndex}
                        value={occupant ?? ''}
                        onChange={(e) =>
                          assignPlayerToSlot(team as TeamNumber, slotIndex, e.target.value)
                        }
                        className="w-full rounded-xl border px-3 py-2 bg-surface text-sm text-text border-border focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-[border-color,box-shadow] duration-150"
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

      {/* Section 5: Flights — kun for best-ball (eksakt 8 spillere → 4 lag
          fordelt på 1-4 flighter). Par-stableford skipper denne seksjonen
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
                      {t('teamBadge', { team })}
                    </span>
                    <span className="text-sm text-text flex-1 truncate">
                      {shortName(p)}
                    </span>
                    <div className="flex gap-1" role="group" aria-label={t('teeGroupAriaLabel')}>
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
        isShamble) &&
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
                  <div className="flex gap-1" role="group" aria-label={t('teeGroupAriaLabel')}>
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
    </>
  );
}
