// Team-format limits for the six team formats outside the matchplay family —
// the scramble family (Texas, Ambrose, Florida, shamble) and the pair formats
// best ball and patsome (#2009, #2011): one home for "how many players and how
// many teams can this game have".
//
// Grensene bodde tidligere fire steder som ikke visste om hverandre: en
// hardkodet `i < 8`-løkke per validator i `gamePayload.ts`, antalls-predikatet i
// `lib/wizard/fitsPlayerCount.ts`, skjul-reglene i lag-rutenettet
// (`TeamsAssignmentSection.tsx`) og lagstørrelse-listene i `TeamSizeSelector`.
// De divergerte: shamble à 3 viste fire lag i rutenettet mens validatoren bare
// leste åtte spillere, så admin kunne fylle 12 plasser og få `team_balance` i
// retur (#2009 sidefunn 1). Alle fire leser herfra nå — AGENTS.md trap 4.
//
// #2011 added readers outside the wizard, so open self-registration stops at
// the same cap: `registerForOpenGame` through `registrationPlayerCap`
// (`lib/wizard/fitsPlayerCount.ts`), and `submitTeamRegistration` through
// `teamModePlayerCap` and `maxTeamsForSize`. #2059 added the organiser's
// surfaces: adding a player or a guest on the roster pages reads
// `organizerPlayerCap`, and the signups page warns through
// `registrationPlayerCap`.
//
// #2148: the cap is a player cap, not a team cap. `TEAM_FORMAT_PLAYER_CAP`
// players, and the number of teams follows from the team size — 20 pairs,
// 13 teams of three, 10 teams of four. Raising the cap is a change to that one
// number; the wizard's grid, the validators, open registration and the native
// app all read it from here.

import type { GameMode } from '@/lib/scoring/modes/types';

/** Spillertaket for lag-formatene (#2148). Heves ved å endre dette tallet. */
export const TEAM_FORMAT_PLAYER_CAP = 40;

/**
 * Et lag-format er en turnering først når det finnes to lag å sammenligne
 * (#467). Ett fullt lag er en øvelse, ikke en konkurranse.
 */
export const MIN_TEAMS = 2;

/**
 * Øvre grense for hvor mange spillere payload-validatorene for lag-formatene
 * godtar (de leser én slot til, så spiller nummer 41 gir en feilkode i stedet
 * for å forsvinne stille), og dermed for hvor mange veiviseren kan sende inn.
 */
export const MAX_TEAM_FORMAT_PLAYERS = TEAM_FORMAT_PLAYER_CAP;

/**
 * Hvor mange hele lag taket gir plass til ved en lagstørrelse: 20 par, 13 lag
 * à tre, 10 lag à fire. Ugyldig lagstørrelse regnes som 1.
 */
export function maxTeamsForSize(teamSize: number): number {
  return Math.floor(TEAM_FORMAT_PLAYER_CAP / Math.max(1, Math.floor(teamSize)));
}

/**
 * Høyeste lagnummer noe lag-format kan ha, uavhengig av lagstørrelse: taket
 * delt på den minste lagstørrelsen (par). Validatorene og veiviserens
 * datamodell bruker det som øvre grense for `team_number` og `flight_number`.
 */
export const MAX_TEAM_NUMBER = maxTeamsForSize(2);

/**
 * Hvor mange lagkort rutenettet viser når `selectedCount` spillere er valgt:
 * nok til alle valgte, minst to (en turnering trenger to lag å sammenligne),
 * og aldri flere enn taket gir plass til. Rutenettet på nettsiden og
 * lagknappene i appen leser begge herfra, så de viser like mange lag.
 */
export function teamGridSize(selectedCount: number, teamSize: number): number {
  const size = Math.max(1, Math.floor(teamSize));
  const needed = Math.ceil(Math.max(0, selectedCount) / size);
  return Math.min(maxTeamsForSize(size), Math.max(MIN_TEAMS, needed));
}

/**
 * Standard startgruppe (flight) for et lag i best ball: to par per flight,
 * så lag 1–2 → 1, lag 3–4 → 2, lag 5–6 → 3. Arrangøren kan overstyre.
 */
export function defaultFlightForTeam(team: number): number {
  return Math.max(1, Math.ceil(team / 2));
}

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
 * støttet lagstørrelse går opp i `n` OG gir mellom `MIN_TEAMS` og
 * `maxTeamsForSize(lagstørrelse)` lag.
 *
 * Eksempler for Texas (2/3/4 per lag): 4 ✓ (2 lag à 2), 10 ✓ (5 lag à 2),
 * 39 ✓ (13 lag à 3), 40 ✓ (20 par / 10 lag à 4), 41 ✗ (går ikke opp),
 * 42 ✗ (over taket).
 */
export function fitsTeamFormat(mode: GameMode, n: number): boolean {
  return teamSizesForMode(mode).some((size) => {
    if (n % size !== 0) return false;
    const teams = n / size;
    return teams >= MIN_TEAMS && teams <= maxTeamsForSize(size);
  });
}

/**
 * Hvor mange spillere velgeren lar arrangøren huke av for et lag-format: fulle
 * lag opp til taket, altså `maxTeamsForSize(lagstørrelse) × lagstørrelse` —
 * 40 for par, 39 for lag à tre, 40 for lag à fire (#2148). Var hardkodet til 8
 * i `PlayersSection` før #2009.
 */
export function teamFormatPlayerCap(teamSize: number): number {
  const size = Math.max(1, Math.floor(teamSize));
  return maxTeamsForSize(size) * size;
}

/**
 * Team size for the formats where the organiser does NOT choose one: best ball
 * and patsome always play in pairs (`validateBestBall` / `validatePatsome` emit
 * `team_size: 2` whatever the form data says). Kept apart from
 * `TEAM_FORMAT_TEAM_SIZES` on purpose: best ball allows a single pair, which
 * the two-team minimum in `fitsTeamFormat` would reject.
 */
const FIXED_TEAM_SIZES: Partial<Record<GameMode, number>> = {
  best_ball: 2,
  patsome: 2,
};

/**
 * The team size open self-registration counts seats with (#2062): the fixed
 * size for best ball and patsome, the chosen size when the format supports it,
 * otherwise the smallest size the format supports — and 1 for formats without
 * teams. One home for the size, read by `teamModePlayerCap` for the cap and by
 * `registerForOpenGame` for the seats an existing team holds, so an unknown
 * size can never make the cap tight while the seats stay loose.
 */
export function registrationSeatTeamSize(
  mode: GameMode,
  teamSize: number | null | undefined,
): number {
  const fixed = FIXED_TEAM_SIZES[mode];
  if (fixed !== undefined) return fixed;

  const sizes = teamSizesForMode(mode);
  if (sizes.length === 0) return 1;

  return typeof teamSize === 'number' && sizes.includes(teamSize)
    ? teamSize
    : Math.min(...sizes);
}

/**
 * Upper player cap for a team-format game: full teams up to the player cap,
 * i.e. `maxTeamsForSize(team size) × team size` (#2011, #2148). Open self-registration reads it so a
 * game cannot collect more players or teams than the wizard can show. `null`
 * for formats without a team concept here (solo, stableford, the matchplay
 * family) — other rules own their cap.
 *
 * A missing or unsupported `teamSize` falls to the smallest size the format
 * supports (`registrationSeatTeamSize`): an unknown cap must never be roomier
 * than the grid.
 */
export function teamModePlayerCap(
  mode: GameMode,
  teamSize: number | null | undefined,
): number | null {
  if (FIXED_TEAM_SIZES[mode] === undefined && teamSizesForMode(mode).length === 0) {
    return null;
  }
  return Math.min(
    teamFormatPlayerCap(registrationSeatTeamSize(mode, teamSize)),
    MAX_TEAM_FORMAT_PLAYERS,
  );
}

/**
 * The cap the organiser meets when adding players or guests to a team-format
 * game on the roster pages (#2059): the same number open self-registration
 * stops at, so «fullt» means one thing everywhere. The organiser's gates count
 * active `game_players` rows, not the seats a registered team holds — the
 * organiser curates the roster (#662).
 *
 * Takes the raw `game_mode` string the actions read from the row; a mode
 * outside the team formats has no cap here.
 */
export function organizerPlayerCap(
  mode: GameMode | string,
  modeConfig: { team_size?: number } | null | undefined,
): number | null {
  return teamModePlayerCap(mode as GameMode, modeConfig?.team_size);
}

/**
 * How many teams «Trekk tilfeldig» deals `n` selected players into at the
 * chosen `teamSize`, or `null` when the draw must refuse (#2012): every team
 * full, no leftover, and no more teams than the cap allows at that size.
 *
 * `fitsTeamFormat` cannot answer this. It asks whether ANY supported size
 * fits, so 12 players pass through size 3 even when the organiser has
 * switched to pairs and a draw would deal six teams. It also knows neither
 * best ball nor par-stableford, and it demands two teams, while best ball
 * has always let a single pair be drawn.
 */
export function randomDrawTeamCount(teamSize: number, n: number): number | null {
  if (!Number.isInteger(teamSize) || teamSize < 2) return null;
  if (!Number.isInteger(n) || n % teamSize !== 0) return null;
  const teams = n / teamSize;
  return teams >= 1 && teams <= maxTeamsForSize(teamSize) ? teams : null;
}
