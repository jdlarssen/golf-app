/**
 * Ren visnings-/redigerings-logikk for splittet-cup-dag-bunten (#1441, F3c,
 * F3d owner-QA-runde).
 *
 * `generateSplitDayPlan` (cupPairing.ts) produserer en flat liste av
 * `PlannedBundleMatch[]` (4 per flight: greensome, best_ball, 2× singles).
 * Oppstillings-editoren i wizarden trenger dem gruppert per flight for
 * visning, en måte å bytte hvem-møter-hvem i singles-parene UTEN å røre
 * greensome/best-ball-paret eller hente inn spillere fra andre flights (de
 * fire spillerne i en flight er et fysisk krav — samme fire spiller hele
 * runden, D4) — og (F3d) en måte å bytte HVEM som sitter i en gitt
 * flight-posisjon, på tvers av eller innad i flights.
 */

import type { PlannedBundleMatch } from './cupPairing';

/** Hvilket lag en flight-posisjon tilhører — speiler `PlannedBundleMatch`s
 * `side1`/`side2`-felt (lag 1 / lag 2), ikke cupens `team1`/`team2`-navn. */
export type FlightTeamSide = 'side1' | 'side2';

export type SplitDayFlight = {
  flightIndex: number;
  greensome: PlannedBundleMatch;
  bestBall: PlannedBundleMatch;
  /** Alltid nøyaktig to — rank1-mot-rank1 og rank2-mot-rank2 (default) eller
   * byttet via `swapFlightSinglesPairing`. */
  singles: [PlannedBundleMatch, PlannedBundleMatch];
};

/**
 * Grupperer bunt-matchene per flight, sortert på `flightIndex`. En flight med
 * mangler (ikke nøyaktig én greensome + én best_ball + to singles) hoppes
 * over — kan ikke skje med output fra `generateSplitDayPlan`, men editoren
 * skal ikke krasje på en uventet payload.
 */
export function groupBundleMatchesByFlight(
  matches: PlannedBundleMatch[],
): SplitDayFlight[] {
  const byFlight = new Map<number, PlannedBundleMatch[]>();
  for (const m of matches) {
    const arr = byFlight.get(m.flightIndex) ?? [];
    arr.push(m);
    byFlight.set(m.flightIndex, arr);
  }

  const flights: SplitDayFlight[] = [];
  const flightIndexes = Array.from(byFlight.keys()).sort((a, b) => a - b);
  for (const flightIndex of flightIndexes) {
    const ms = byFlight.get(flightIndex) ?? [];
    const greensome = ms.find((m) => m.format === 'greensome_matchplay');
    const bestBall = ms.find((m) => m.format === 'best_ball');
    const singles = ms.filter((m) => m.format === 'singles_matchplay');
    if (!greensome || !bestBall || singles.length !== 2) continue;
    flights.push({ flightIndex, greensome, bestBall, singles: [singles[0], singles[1]] });
  }
  return flights;
}

/**
 * Bytter singles-parene innad i én flight: fra rank1-vs-rank1/rank2-vs-rank2
 * til rank1-vs-rank2/rank2-vs-rank1 (og tilbake — kallet er sin egen invers).
 * Bytter KUN `side2` mellom de to singles-matchene i flighten — `side1`
 * (rank-identiteten hver singles-match er navngitt etter) og alle andre
 * flights/matcher (greensome, best_ball) er urørt. Med bare fire spillere i
 * flighten finnes det nøyaktig to gyldige 1v1-paringer, så et bytte trenger
 * ingen fri spiller-velger — én knapp per flight er nok.
 *
 * No-op (returnerer `matches` uendret) hvis flighten ikke har nøyaktig to
 * singles-matcher (defensivt — kan ikke skje med gyldig bunt-output).
 */
export function swapFlightSinglesPairing(
  matches: PlannedBundleMatch[],
  flightIndex: number,
): PlannedBundleMatch[] {
  const singlesInFlight = matches.filter(
    (m) => m.flightIndex === flightIndex && m.format === 'singles_matchplay',
  );
  if (singlesInFlight.length !== 2) return matches;
  const [a, b] = singlesInFlight;
  return matches.map((m) => {
    if (m.id === a.id) return { ...m, side2: b.side2 };
    if (m.id === b.id) return { ...m, side2: a.side2 };
    return m;
  });
}

/**
 * Bytter HVEM som sitter i en gitt flight-posisjon (lag, flight, slot 0/1) —
 * owner-QA-funn på #1441: «Det er ikke mulig å velge hvem som skal være i
 * flight … Det må det være.» Kalleren identifiserer posisjonen med
 * (`flightIndex`, `side`, `slotIndex`); `playerId` er spilleren organisatoren
 * VALGTE i den posisjonens dropdown.
 *
 * To case, begge håndtert av SAMME identitets-baserte bytte (ingen egen
 * gren nødvendig):
 *
 *  - `playerId` sitter i en ANNEN flight → de to spillerne bytter plass:
 *    greensome/best-ball-paret i BEGGE flights oppdateres (samme array-
 *    innhold speilet på begge matcher, som ved generering), og singles-
 *    matchen(e) som pekte på hver spiller følger dem til sin nye flight.
 *  - `playerId` er LAGKAMERATEN i SAMME flight (den andre slotten) → et
 *    internt bytte. Greensome/best-ball-PARET er semantisk uendret (paret
 *    ER flightens to spillere på det laget, uansett rekkefølge — se
 *    `swapFlightSinglesPairing`s docstring), men fordi singles-parene er
 *    keyet på indeks (`side{team}Pair[0]` mot `side{team}Pair[1]`, se
 *    `generateSplitDayPlan`), bytter dette HVEM som møter hvem i singles —
 *    samme synlige effekt som `swapFlightSinglesPairing`, bare via
 *    spiller-valg i stedet for en fast «bytt paring»-knapp.
 *
 * Implementasjon: finn spilleren som STÅR i target-slotten
 * (`currentPlayerId`) og spilleren som BLE VALGT (`playerId`), og bytt dem
 * om — BY IDENTITY, ikke by index — i alle matcher i de(n) berørte
 * flighten(e) sitt `side`-felt. Identitets-bytte (fremfor indeks-bytte) er
 * bevisst: singles-matchenes `side{team}`-array kan allerede være reordnet
 * av en tidligere `swapFlightSinglesPairing`-kall (som KUN bytter `side2`
 * mellom de to singles-matchene, uavhengig av greensome/best-ball-paret) —
 * å bytte by identity følger spilleren uansett hvilken singles-match som for
 * øyeblikket har dem, og holder seg derfor korrekt uansett tidligere bytter.
 *
 * No-op (returnerer `matches` uendret) i tre defensive tilfeller:
 *  - `playerId` er allerede den som står i target-slotten (organisatoren
 *    valgte samme spiller på nytt).
 *  - Flighten/formatet finnes ikke i `matches` (malformed input).
 *  - `playerId` er ikke funnet i NOEN flight sitt `side`-felt — dette skjer
 *    for en spiller som er valgt til laget (Step1Roster) men IKKE fikk plass
 *    i en flight pga. ulik lagstørrelse («bye», se `splitDayFlightCount`s
 *    klamping). Å hente en bye-spiller INN i en flight ville krevd å sende
 *    den fortrengte spilleren til en bye-«pool» som ikke finnes i
 *    `PlannedBundleMatch[]`s form — utenfor scope for denne runden (ASSUMPTION,
 *    se GenerateMatchesWizard.tsx sin oppstillings-editor for UI-siden av
 *    dette valget).
 */
export function swapFlightPlayer(
  matches: PlannedBundleMatch[],
  flightIndex: number,
  side: FlightTeamSide,
  slotIndex: 0 | 1,
  playerId: string,
): PlannedBundleMatch[] {
  const greensome = matches.find(
    (m) => m.flightIndex === flightIndex && m.format === 'greensome_matchplay',
  );
  if (!greensome) return matches;

  const currentPlayerId = greensome[side][slotIndex];
  if (currentPlayerId === undefined || currentPlayerId === playerId) return matches;

  let otherFlightIndex: number | undefined;
  for (const m of matches) {
    if (m.format !== 'greensome_matchplay') continue;
    if (m[side][0] === playerId || m[side][1] === playerId) {
      otherFlightIndex = m.flightIndex;
      break;
    }
  }
  if (otherFlightIndex === undefined) return matches;

  return matches.map((m) => {
    if (m.flightIndex !== flightIndex && m.flightIndex !== otherFlightIndex) return m;
    const arr = m[side];
    if (!arr.includes(currentPlayerId) && !arr.includes(playerId)) return m;
    const nextArr = arr.map((id) => {
      if (id === currentPlayerId) return playerId;
      if (id === playerId) return currentPlayerId;
      return id;
    });
    return { ...m, [side]: nextArr };
  });
}

/** Antall flights et splittet-cup-dag-oppsett gir for gitte lagstørrelser —
 * speiler klampingen i `generateSplitDayPlan` (2 spillere per side per
 * flight; overskytende spillere blir bye). */
export function splitDayFlightCount(team1Size: number, team2Size: number): number {
  return Math.min(Math.floor(team1Size / 2), Math.floor(team2Size / 2));
}

/** Totalt antall cup-matcher (4 per flight: greensome + best_ball + 2×
 * singles) for gitte lagstørrelser. */
export function splitDayTotalMatches(team1Size: number, team2Size: number): number {
  return splitDayFlightCount(team1Size, team2Size) * 4;
}
