// Lag-format-grensene for scramble-familien (#2009) — ett hjem for «hvor mange
// spillere og hvor mange lag kan et scramble-spill ha».
//
// Grensene bodde tidligere fire steder som ikke visste om hverandre: en
// hardkodet `i < 8`-løkke per validator i `gamePayload.ts`, antalls-predikatet i
// `lib/wizard/fitsPlayerCount.ts`, skjul-reglene i lag-rutenettet
// (`TeamsAssignmentSection.tsx`) og lagstørrelse-listene i `TeamSizeSelector`.
// De divergerte: shamble à 3 viste fire lag i rutenettet mens validatoren bare
// leste åtte spillere, så admin kunne fylle 12 plasser og få `team_balance` i
// retur (#2009 sidefunn 1). Alle fire leser herfra nå — AGENTS.md trap 4.
//
// Taket er `MAX_TEAMS × 4` fordi lag-rutenettet har fire lag og største
// lagstørrelse er fire. Utvides rutenettet, endres `MAX_TEAMS` her og
// `TEAM_NUMBERS` i `useGameFormState.ts` i samme commit — `teamFormatLimits.test.ts`
// låser at de to er enige.

import type { GameMode } from '@/lib/scoring/modes/types';

/** Antall lag lag-rutenettet i veiviseren tilbyr (speiles av `TEAM_NUMBERS`). */
export const MAX_TEAMS = 4;

/** Største lagstørrelse noen lag-format i familien støtter. */
export const MAX_TEAM_SIZE = 4;

/**
 * Et lag-format er en turnering først når det finnes to lag å sammenligne
 * (#467). Ett fullt lag er en øvelse, ikke en konkurranse.
 */
export const MIN_TEAMS = 2;

/**
 * Øvre grense for antall `player_${i}_*`-slots payload-validatorene i
 * scramble-familien leser, og dermed for hvor mange spillere veiviseren kan
 * sende inn: fire lag à fire spillere.
 */
export const MAX_TEAM_FORMAT_PLAYERS = MAX_TEAMS * MAX_TEAM_SIZE;

/**
 * Lagstørrelsene hvert format i scramble-familien støtter.
 *
 *  - Texas scramble / Ambrose: 2, 3 eller 4. 3-mannslag kom i #2009; Ambrose
 *    trenger ingen ny default-prosent (formelen `100 / (2 × lagstørrelse)`
 *    dekker 3 → 16,7 %), Texas fikk 15 % i `defaultTexasHandicapPct`.
 *  - Florida Scramble / Shamble: 3 eller 4 — 2-mannslag gir ikke mening når
 *    regelen er at én spiller står over (Florida) eller at flere baller
 *    spilles inn (shamble).
 */
export const TEAM_FORMAT_TEAM_SIZES: Partial<Record<GameMode, readonly number[]>> = {
  texas_scramble: [2, 3, 4],
  ambrose: [2, 3, 4],
  florida_scramble: [3, 4],
  shamble: [3, 4],
};

/**
 * Lagstørrelsene et format støtter, eller tom liste for formater utenfor
 * scramble-familien.
 */
export function teamSizesForMode(mode: GameMode): readonly number[] {
  return TEAM_FORMAT_TEAM_SIZES[mode] ?? [];
}

/**
 * Kan `n` spillere fordeles på hele lag i dette formatet? Sant når minst én
 * støttet lagstørrelse går opp i `n` OG gir mellom `MIN_TEAMS` og `MAX_TEAMS`
 * lag.
 *
 * Eksempler for Texas (2/3/4 per lag): 4 ✓ (2 lag à 2), 6 ✓ (2 lag à 3),
 * 10 ✗ (5 lag à 2 finnes ikke — rutenettet har fire), 12 ✓ (4 lag à 3),
 * 16 ✓ (4 lag à 4), 17 ✗ (over taket).
 */
export function fitsTeamFormat(mode: GameMode, n: number): boolean {
  return teamSizesForMode(mode).some((size) => {
    if (n % size !== 0) return false;
    const teams = n / size;
    return teams >= MIN_TEAMS && teams <= MAX_TEAMS;
  });
}

/**
 * Hvor mange spillere velgeren lar arrangøren huke av for et lag-format: fulle
 * lag i hele rutenettet, altså `MAX_TEAMS × lagstørrelse` — 8 for lag à 2,
 * 12 for lag à 3, 16 for lag à 4. Var hardkodet til 8 i `PlayersSection`
 * (det fjerde hjemmet for samme regel) og stoppet arrangøren ved åtte
 * spillere selv om rutenettet og validatoren tok tolv (#2009, funnet i
 * eierens klikkrunde).
 */
export function teamFormatPlayerCap(teamSize: number): number {
  return MAX_TEAMS * Math.max(1, Math.floor(teamSize));
}

/**
 * Hvor mange lag rutenettet skal vise for en gitt lagstørrelse: alle fire, med
 * mindre lagstørrelsen gjør at det siste laget ikke får plass under taket.
 * Med dagens tall (16 slots, maks lagstørrelse 4) er svaret alltid
 * `MAX_TEAMS` — funksjonen finnes for at rutenettet ikke skal drifte fra
 * taket hvis ett av tallene endres senere.
 */
export function teamsShownForSize(teamSize: number): number {
  if (teamSize <= 0) return MAX_TEAMS;
  return Math.min(MAX_TEAMS, Math.floor(MAX_TEAM_FORMAT_PLAYERS / teamSize));
}
