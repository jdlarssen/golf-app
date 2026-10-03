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
 *  - every other format (stableford, solo strokeplay, Wolf, Nassau, Skins,
 *    Bingo Bango Bongo, Nines, Round Robin, Acey Deucey) → only tee per player
 *
 * Tee per player shows in every format but best ball, which carries the M/D/J
 * toggle in its flights part (#2437). Which parts show is
 * `teamsAssignmentParts`.
 *
 * Nummerering speiler GameForm-stacked-layouten («4. Lag», «5. Flights»,
 * «5. Tee per spiller»). Wizard-en kan be om å droppe det nummeriske
 * prefiket via `hideNumbering`-flagget — wizard-stegene har sin egen
 * stepper-tittel.
 *
 * #2321: drawn as the step 4 artboards (`Nyttspill-4-lag`, `-4-sider` and the
 * TEE PER SPILLER block on `-4-tee-gjest`), in the wizard's second screen and
 * in GameForm alike. Each part is a kicker (`FormSection`, its `<h2>` inside
 * the legend) over team cards (`SlotCard`) or a row list. Every part keeps a
 * `<section>` around it: GameForm's tests find the team slots with
 * `section select`. The logic is unchanged.
 */

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { PlayerOption } from '../GameForm';
import type { GameFormState } from '../useGameFormState';
import { Button } from '@/components/ui/Button';
import { CardSelect } from '@/components/ui/CardField';
import { FormSection } from '@/components/ui/FormSection';
import { MiniChip } from '@/components/ui/MiniChip';
import { UNAVAILABLE_OPTION_CLASSES } from '@/components/ui/SegmentedField';
import { SlotCard } from '@/components/ui/SlotCard';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import {
  maxTeamsForSize,
  teamGridShape,
  teamNumberRange,
} from '@/lib/games/teamFormatLimits';
import { playerOptionShortName } from './playerLabels';

type Props = {
  state: GameFormState;
  players: PlayerOption[];
  /**
   * Når true, dropper «4. »/«5. »-prefikser i headings. Wizard-en bruker
   * stepper-header for nummerering, så heading-en blir kun «Lag»/«Sider»
   * inne i wizard-stegene.
   */
  hideNumbering?: boolean;
  /**
   * #2321: the count of selected players right-aligned in the first part's
   * kicker («8 spillere valgt», «2 av 2 spillere valgt»). Only the wizard's
   * second screen turns it on: GameForm shows the count in its VALGTE row.
   */
  showSelectedCount?: boolean;
};

const GENDER_CATEGORIES = ['M', 'D', 'J'] as const;

/**
 * M/D/J-kategorivelger for én spiller. Brukt to steder (flight-grid og
 * tee-per-spiller), så logikken for å disable en kategori tee-en mangler
 * rating for (#721) bor ett sted. En utilgjengelig kategori er `disabled`
 * med en forklarende `title`; klem-ved-tee-bytte i hooken sørger for at
 * ingen spiller står igjen på en utilgjengelig kategori.
 *
 * #2240: a radiogroup named after the player (roving tabindex + arrow keys),
 * and every selected category uses the primary pair — the old «J» fill
 * (bg-muted + text-text) read at 1.4:1, and «D» (accent + text) at 1.5:1 in
 * the dark theme.
 *
 * #2321: 44 × 44 px tiles as the step 4 artboards draw them, so the hit area
 * needs no tap-extend. An unavailable category is a dashed, faded tile
 * (`UNAVAILABLE_OPTION_CLASSES`, shared with the guest form's pills, #2437).
 */
function PlayerGenderToggle({
  pid,
  teeChoiceFor,
  setPlayerGenders,
  teeGenderAvailability,
  ariaLabel,
  unavailableTitle,
}: {
  pid: string;
  teeChoiceFor: GameFormState['teeChoiceFor'];
  setPlayerGenders: GameFormState['setPlayerGenders'];
  teeGenderAvailability: GameFormState['teeGenderAvailability'];
  ariaLabel: string;
  unavailableTitle: string;
}) {
  // #2209: the same value `PlayerTeeChoiceInputs` sends — what is shown is
  // what the server gets.
  const current = teeChoiceFor(pid);
  const select = (g: (typeof GENDER_CATEGORIES)[number]) =>
    setPlayerGenders((prev) => ({ ...prev, [pid]: g }));
  const rovingProps = useRovingFocus(
    GENDER_CATEGORIES,
    current,
    select,
    (g) => !teeGenderAvailability[g],
  );
  return (
    <div className="flex shrink-0 gap-1.5" role="radiogroup" aria-label={ariaLabel}>
      {GENDER_CATEGORIES.map((g, idx) => {
        const unavailable = !teeGenderAvailability[g];
        const selected = current === g;
        return (
          <button
            key={g}
            {...rovingProps(idx)}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={unavailable}
            title={unavailable ? unavailableTitle : undefined}
            onClick={() => select(g)}
            // pb-0.5: the letter sits 1 px higher in the 44 px tile, as the artboards draw it.
            className={`flex h-11 w-11 items-center justify-center rounded-xl pb-0.5 font-sans text-sm font-semibold leading-[normal] transition-colors ${
              unavailable
                ? UNAVAILABLE_OPTION_CLASSES
                : selected
                  ? 'bg-primary text-white dark:text-bg'
                  : 'border border-border bg-surface text-text hover:bg-primary-soft'
            }`}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}

type PartsState = Pick<
  GameFormState,
  | 'selectedPlayerIds'
  | 'isMatchplay'
  | 'requiresTeams'
  | 'isBestBall'
  | 'isParStableford'
  | 'isPatsome'
  | 'isTeamMatchplay'
  | 'isTexas'
  | 'isAmbrose'
  | 'isFlorida'
  | 'isShamble'
  | 'teamSize'
  | 'teamsComplete'
>;

/**
 * Which of the four parts (sides / team grid / flights / tee per player) the
 * section renders for the current state. The component and
 * `teamsAssignmentHasContent` both read it, so the guards live in one place.
 */
export function teamsAssignmentParts(state: PartsState): {
  sides: boolean;
  teams: boolean;
  flights: boolean;
  tee: boolean;
} {
  const n = state.selectedPlayerIds.length;
  return {
    sides: state.isMatchplay && n > 0,
    teams:
      state.requiresTeams &&
      ((state.isBestBall && n >= 2) ||
        (state.isParStableford && n >= 2) ||
        (state.isTexas && n >= state.teamSize) ||
        (state.isAmbrose && n >= state.teamSize) ||
        (state.isFlorida && n >= state.teamSize) ||
        (state.isShamble && n >= state.teamSize) ||
        (state.isPatsome && n >= 2) ||
        (state.isTeamMatchplay && n >= 2)),
    flights: state.isBestBall && state.teamsComplete,
    // #2437: the publish guard (`playersWithUnratedCategory`) checks every
    // selected player in every format, so the M/D/J toggle must exist wherever
    // players are picked. Best ball carries it in the flights part.
    tee: n > 0 && !state.isBestBall,
  };
}

/**
 * #909: forteller om TeamsAssignmentSection vil rendre noe innhold for
 * gjeldende state. GameForm bruker den til å bestemme om «Inndeling»-
 * Disclosure-panelet skal vises i det hele tatt (et tomt panel ville vært
 * forvirrende). Both this and the component read `teamsAssignmentParts`.
 */
export function teamsAssignmentHasContent(state: GameFormState): boolean {
  const { sides, teams, flights, tee } = teamsAssignmentParts(state);
  return sides || teams || flights || tee;
}

/** A part's kicker: the `<h2>` sits inside the legend so it stays a heading. */
function PartLegend({ children }: { children: ReactNode }) {
  return <h2>{children}</h2>;
}

export function TeamsAssignmentSection({
  state,
  players,
  hideNumbering = false,
  showSelectedCount = false,
}: Props) {
  const t = useTranslations('wizard.sections.teams');
  const tPlayers = useTranslations('wizard.sections.players');
  const pendingLabel = tPlayers('pendingLabel');
  const idPrefix = useId();

  const shortName = (p: PlayerOption) => playerOptionShortName(p, pendingLabel);
  const {
    gameMode,
    selectedPlayerIds,
    teamByPlayer,
    flightByPlayer,
    teeChoiceFor,
    setPlayerGenders,
    teeGenderAvailability,
    playersByTeam,
    isBestBall,
    isParStableford,
    isMatchplay,
    isTexas,
    isAmbrose,
    isFlorida,
    isShamble,
    isPatsome,
    isTeamMatchplay,
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
  const n = selectedPlayerIds.length;

  const numberPrefix = (num: string) => (hideNumbering ? '' : `${num}. `);
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

  const {
    sides: showSides,
    teams: showTeams,
    flights: showFlights,
    tee: showTee,
  } = teamsAssignmentParts(state);
  const firstPart = showSides ? 'sides' : showTeams ? 'teams' : showFlights ? 'flights' : 'tee';
  const countText = isMatchplay
    ? tPlayers('counterMatchplay', { count: n })
    : n === 1
      ? tPlayers('counterSingular', { count: n })
      : tPlayers('counterPlural', { count: n });
  const asideFor = (part: typeof firstPart) =>
    showSelectedCount && part === firstPart ? countText : undefined;

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
    n,
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

  const showDrawButtons =
    isBestBall || isParStableford || isTexas || isAmbrose || isFlorida || isShamble;
  // Patsome and team matchplay have no draw: clearing only, once someone is
  // assigned.
  const showClearOnly =
    (isPatsome || isTeamMatchplay) &&
    selectedPlayerIds.some((pid) => teamByPlayer[pid] !== undefined);

  return (
    <>
      {/* Matchplay: side-tilordning. Vises så snart admin har valgt minst én
          spiller (slik at admin kan tilordne side mens spiller-listen fylles
          ut). Lag/flight-grid-en for team-modi rendres aldri for matchplay. */}
      {showSides && (
        <section>
          <FormSection
            variant="bare"
            legend={<PartLegend>{numberPrefix('4')}{t('sidesHeading')}</PartLegend>}
            aside={asideFor('sides')}
            asideFlush
            description={t('sidesDescription')}
          >
            <div className="grid grid-cols-2 gap-2">
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
                  <SlotCard key={side} title={t('sideLabel', { side })}>
                    <CardSelect
                      size="slot"
                      labelHidden
                      id={`matchplay_side_${side}`}
                      label={t('sideSrLabel', { side })}
                      value={occupant ?? ''}
                      onChange={(e) => assignPlayerToSide(side, e.target.value)}
                    >
                      <option value="">{t('emptySlotOption')}</option>
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {shortName(p)}
                        </option>
                      ))}
                    </CardSelect>
                  </SlotCard>
                );
              })}
            </div>
          </FormSection>
        </section>
      )}

      {/* Lag — kun for team-modi (teamSize ≥ 2), synlig fra to spillere (best
          ball, par-stableford, patsome, lag-matchplay) eller én lagstørrelse
          (scramble-familien). Antall lagkort og plasser leses fra
          `teamFormatLimits` (#2009, #2148), samme kilde som validatoren. */}
      {showTeams && (
        <section>
          <FormSection
            variant="bare"
            legend={<PartLegend>{numberPrefix('4')}{t('teamsHeading')}</PartLegend>}
            aside={asideFor('teams')}
            description={teamsDescription()}
          >
            {/* «Trekk tilfeldig»/«Tøm lag» for best ball, par-stableford and the
                scramble family (#2012). The draw deals teams of the chosen size;
                the button is disabled while the count leaves a leftover or needs
                more teams than the player cap allows (`canDrawRandomTeams`). */}
            {(showDrawButtons || showClearOnly) && (
              <div className="flex flex-wrap gap-2 pb-2.5">
                {showDrawButtons && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="chip"
                    // The artboards set the label at line-height normal.
                    className="leading-[normal]"
                    onClick={drawRandomTeams}
                    disabled={!canDrawRandomTeams}
                    data-testid="draw-random-teams"
                  >
                    {t('drawRandomButton')}
                  </Button>
                )}
                <Button type="button" variant="secondary" size="chip" className="leading-[normal]" onClick={clearTeams}>
                  {t('clearTeamsButton')}
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {teamNumberRange(gridTeamCount).map((team) => (
                <SlotCard
                  key={team}
                  data-testid={`team-card-${team}`}
                  title={
                    isTeamMatchplay
                      ? t('sideTeamLabel', { team })
                      : t('teamLabel', { team })
                  }
                >
                  {Array.from({ length: slotCount }, (_, slotIndex) => {
                    const occupant = playersByTeam[team][slotIndex];
                    const options = slotOptions(team, slotIndex);
                    return (
                      <CardSelect
                        key={slotIndex}
                        size="slot"
                        labelHidden
                        id={`${idPrefix}-team-${team}-slot-${slotIndex}`}
                        label={
                          isTeamMatchplay
                            ? t('sideTeamSlotAria', { team, slot: slotIndex + 1 })
                            : t('teamSlotAria', { team, slot: slotIndex + 1 })
                        }
                        value={occupant ?? ''}
                        onChange={(e) =>
                          assignPlayerToSlot(team, slotIndex, e.target.value)
                        }
                      >
                        <option value="">{t('emptySlotOption')}</option>
                        {options.map((p) => (
                          <option key={p.id} value={p.id}>
                            {shortName(p)}
                          </option>
                        ))}
                      </CardSelect>
                    );
                  })}
                </SlotCard>
              ))}
            </div>
          </FormSection>
        </section>
      )}

      {/* Flights — kun for best-ball (standard to par per flight, #2148).
          Par-stableford skipper denne seksjonen siden flight-tilordning
          auto-mapper til team_number i payloaden. */}
      {showFlights && (
        <section>
          <FormSection
            variant="list"
            legend={<PartLegend>{numberPrefix('5')}{t('flightsHeading')}</PartLegend>}
            aside={asideFor('flights')}
            description={t('flightsDescription')}
          >
            {teamsWithPlayers.flatMap((team) =>
              playersByTeam[team].map((pid) => {
                // #2210: a rostered player the options list does not carry is
                // skipped instead of crashing the section (same guard as the
                // per-player tee list below).
                const p = players.find((x) => x.id === pid);
                if (!p) return null;
                const flight = flightByPlayer[pid] ?? teamDefaultFlight(team);
                return (
                  <div key={pid} className="flex flex-col gap-2 px-3.5 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <MiniChip tone="neutral">{t('teamBadge', { team })}</MiniChip>
                      <span className="min-w-0 truncate font-sans text-[15px] font-semibold leading-[normal] text-text">
                        {shortName(p)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <PlayerGenderToggle
                        pid={pid}
                        teeChoiceFor={teeChoiceFor}
                        setPlayerGenders={setPlayerGenders}
                        teeGenderAvailability={teeGenderAvailability}
                        ariaLabel={t('teeGroupAriaLabel', { name: shortName(p) })}
                        unavailableTitle={t('categoryNotRated')}
                      />
                      <CardSelect
                        size="compact"
                        labelHidden
                        // 112 px at the row's end; in a narrow panel (GameForm) the
                        // row wraps and it drops below M/D/J, right-aligned, whole.
                        wrapperClassName="ml-auto w-[112px]"
                        id={`${idPrefix}-flight-${pid}`}
                        data-testid={`flight-select-${pid}`}
                        label={t('flightSelectAria', { name: shortName(p) })}
                        value={flight}
                        onChange={(e) => setFlightForPlayer(pid, Number(e.target.value))}
                      >
                        {flightOptions.map((f) => (
                          <option key={f} value={f}>
                            {t('flightLabel', { flight: f })}
                          </option>
                        ))}
                      </CardSelect>
                    </div>
                  </div>
                );
              }),
            )}
          </FormSection>
        </section>
      )}

      {/* Tee per player in every format without flights (#2437) — solo, the
          side games (Wolf, Nassau, Skins, Bingo Bango Bongo, Nines, Round
          Robin, Acey Deucey), matchplay and the team formats. Every format
          plays off course handicap per player (slope/CR per category), and the
          publish guard checks every player's category. Best ball handles the
          tee inside the flights part above. */}
      {showTee && (
        <section>
          <FormSection
            variant="list"
            legend={
              <PartLegend>
                {teePerPlayerPrefix}
                {t('teePerPlayerHeading')}
              </PartLegend>
            }
            aside={asideFor('tee')}
            description={t('teePerPlayerDescription')}
          >
            {selectedPlayerIds.map((pid) => {
              const p = players.find((x) => x.id === pid);
              if (!p) return null;
              return (
                <div key={pid} className="flex min-h-[60px] items-center gap-2.5 px-3.5 py-2">
                  {/* 1 px up, as the artboard's row draws the name (the box stays). */}
                  <span className="relative -top-px min-w-0 flex-1 truncate font-sans text-[15px] font-semibold leading-[normal] text-text">
                    {shortName(p)}
                  </span>
                  <PlayerGenderToggle
                    pid={pid}
                    teeChoiceFor={teeChoiceFor}
                    setPlayerGenders={setPlayerGenders}
                    teeGenderAvailability={teeGenderAvailability}
                    ariaLabel={t('teeGroupAriaLabel', { name: shortName(p) })}
                    unavailableTitle={t('categoryNotRated')}
                  />
                </div>
              );
            })}
          </FormSection>
        </section>
      )}
    </>
  );
}
