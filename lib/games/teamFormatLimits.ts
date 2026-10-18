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

import { isStablefordFamily, type GameMode } from '@/lib/scoring/modes/types';
import { isMatchplayMode } from '@/lib/games/matchplaySides';

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

/** Plasser per lagkort og antall lagkort i veiviserens lag-rutenett (#2079). */
export interface TeamGridShape {
  slotsPerTeam: number;
  teamCount: number;
}

/**
 * The shape of the wizard's team grid: the one rule `TeamsAssignmentSection`
 * draws and `useGameFormState` prunes assignments against (#2079).
 *
 *  - Slots per card: the team size in the scramble family, otherwise a pair.
 *  - Cards: team matchplay always has two sides. Every other format grows with
 *    the selected players up to the cap (`teamGridSize`), and a team that
 *    already has players stays on screen even above that (#2148), so
 *    `highestAssignedTeam` is the highest team number holding a player.
 */
export function teamGridShape(
  mode: GameMode,
  teamSize: number,
  selectedCount: number,
  highestAssignedTeam = 0,
): TeamGridShape {
  const slotsPerTeam = teamSizesForMode(mode).length > 0 ? teamSize : 2;
  const teamCount =
    isMatchplayMode(mode) && mode !== 'singles_matchplay'
      ? MIN_TEAMS
      : Math.max(teamGridSize(selectedCount, slotsPerTeam), highestAssignedTeam);
  return { slotsPerTeam, teamCount };
}

/**
 * Releases every assigned player the grid can no longer show (#2079): a player
 * keeps their team only while the team is one of `shape.teamCount` cards and
 * their place in it — the order of `selectedPlayerIds`, the same order the
 * cards fill their slots in — is below `shape.slotsPerTeam`. Everyone who
 * fits keeps their team. Returns the same object when nothing changes, so a
 * switch that fits costs no render.
 */
export function fitAssignmentsToGrid(
  teamByPlayer: Record<string, number>,
  selectedPlayerIds: readonly string[],
  shape: TeamGridShape,
): Record<string, number> {
  const placesTaken = new Map<number, number>();
  let next: Record<string, number> | null = null;
  for (const pid of selectedPlayerIds) {
    const team = teamByPlayer[pid];
    if (team === undefined) continue;
    const place = placesTaken.get(team) ?? 0;
    placesTaken.set(team, place + 1);
    if (team <= shape.teamCount && place < shape.slotsPerTeam) continue;
    next ??= { ...teamByPlayer };
    delete next[pid];
  }
  return next ?? teamByPlayer;
}

/** Lagnumrene `1..count`, stigende. Tom liste når `count` er under 1. */
export function teamNumberRange(count: number): number[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => i + 1);
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
 * The sizes one team may have in a game (#2569): the chosen size, and in the
 * scramble family one fewer as well — an 11-player Texas à 4 is 4/4/3, and a
 * late withdrawal leaves 4/4/4/3. Only sizes the format itself supports
 * (`TEAM_FORMAT_TEAM_SIZES`): Texas and Ambrose à 2 stay pairs (a team of one
 * is no scramble), Florida and shamble à 3 stay threes (no team of 2 there).
 * In champagne a team must have at least `shambleCount` players, since it
 * counts its best N on every hole. Every other format: the size alone (best
 * ball, patsome and par-stableford play in pairs).
 *
 * How many teams may be short has no limit, as long as every team is in the
 * set: 4/3/3/3 is as valid as 4/4/4/3. The validators (`gamePayload.ts`), the
 * wizard (`validateTeamSizeFormat`), the start guard (`startBlockReason`), the
 * count functions below and the Lag section all read it from here.
 */
export function allowedTeamSizes(
  mode: GameMode,
  teamSize: number,
  shambleCount?: number,
): ReadonlySet<number> {
  const supported = teamSizesForMode(mode);
  if (!supported.includes(teamSize)) return new Set([teamSize]);
  const shorter = teamSize - 1;
  const shortAllowed =
    supported.includes(shorter) &&
    (mode !== 'shamble' || shambleCount === undefined || shorter >= shambleCount);
  return new Set(shortAllowed ? [teamSize, shorter] : [teamSize]);
}

/**
 * How `n` players split into teams of `teamSize` (#2569): `ceil(n / teamSize)`
 * teams, the full ones first and the rest one short, or `null` when that
 * leaves a team outside `allowed` or no full team at all. 11 à 4 → [4, 4, 3],
 * 10 à 4 → [4, 3, 3], 9 à 4 → null (3/3/3 is a game à 3), 5 à 4 → null.
 * With only the size itself allowed, `n` must divide evenly, as before.
 */
export function splitIntoTeams(
  n: number,
  teamSize: number,
  allowed: ReadonlySet<number>,
): number[] | null {
  if (!Number.isInteger(n) || n < 1) return null;
  if (!Number.isInteger(teamSize) || teamSize < 1) return null;
  const teams = Math.ceil(n / teamSize);
  const short = teams * teamSize - n;
  if (short > 0 && (!allowed.has(teamSize - 1) || short > teams - 1)) return null;
  return [
    ...Array<number>(teams - short).fill(teamSize),
    ...Array<number>(short).fill(teamSize - 1),
  ];
}

/**
 * A roster's team sizes against the rule (#2569): is every team in `allowed`,
 * and is at least one team full? Publishing and the wizard need both; the
 * start guard only the first, so a game whose withdrawals left 3/3/3 à 4 can
 * still start (each team gets the same percent of its average). Empty teams
 * are the caller's to leave out.
 */
export function teamRosterBalance(
  teamCounts: Iterable<number>,
  teamSize: number,
  allowed: ReadonlySet<number>,
): { allAllowed: boolean; hasFullTeam: boolean } {
  let allAllowed = true;
  let hasFullTeam = false;
  for (const count of teamCounts) {
    if (!allowed.has(count)) allAllowed = false;
    if (count === teamSize) hasFullTeam = true;
  }
  return { allAllowed, hasFullTeam };
}

/**
 * Stableford in the team size picker (#2453): solo, or 4BBB in pairs. One
 * player or one pair is already a game, so the minimum is one team. Kept out
 * of `TEAM_FORMAT_TEAM_SIZES` on purpose: that table also drives the grid,
 * the seat size and the registration cap, and Stableford has no cap there.
 */
const STABLEFORD_TEAM_SIZES: readonly number[] = [1, 2];

/** The sizes «Velg lagstørrelse» offers for a format, and how few teams make a game. */
export interface SelectableTeamSizes {
  sizes: readonly number[];
  minTeams: number;
}

/**
 * The team sizes the picker shows for a format (#2453): the scramble family's
 * `teamSizesForMode` with at least `MIN_TEAMS` teams, and Stableford's solo or
 * 4BBB with at least one. Empty for every other format. `TeamSizeSelector`
 * and `ShambleSetup` read their cards from here, so no size is written twice.
 */
export function selectableTeamSizes(mode: GameMode): SelectableTeamSizes {
  if (isStablefordFamily(mode)) return { sizes: STABLEFORD_TEAM_SIZES, minTeams: 1 };
  return { sizes: teamSizesForMode(mode), minTeams: MIN_TEAMS };
}

/**
 * The selectable team sizes that split `n` players into teams: `n` splits at
 * the size (`splitIntoTeams` with `allowedTeamSizes`, so the scramble family
 * may have teams one short, #2569), into between the format's minimum
 * (`selectableTeamSizes`) and `maxTeamsForSize(size)` teams. Ascending. Empty
 * outside the scramble and Stableford families, for `n = 0`, and above the cap
 * (Stableford solo with more than 40: the picker stops at 40, so the UI never
 * gets there). The format cards read it for their line-up (#2260): «3 eller 4
 * per lag» for Texas with 11.
 */
export function teamSizesThatFit(mode: GameMode, n: number): number[] {
  const { sizes, minTeams } = selectableTeamSizes(mode);
  return sizes.filter((size) => {
    const split = splitIntoTeams(n, size, allowedTeamSizes(mode, size));
    return split !== null && split.length >= minTeams && split.length <= maxTeamsForSize(size);
  });
}

/**
 * The fewest players a team size card takes (#2453, #2569): the format's
 * minimum teams, all full except the last ones, which may be one short where
 * the format allows it. Texas à 4 → 7 (4/3), à 3 → 5 (3/2), à 2 → 4, Florida
 * à 3 → 6, 4BBB → 2.
 */
function fewestPlayersForSize(mode: GameMode, size: number): number {
  const { minTeams } = selectableTeamSizes(mode);
  const shortTeams = allowedTeamSizes(mode, size).has(size - 1) ? minTeams - 1 : 0;
  return minTeams * size - shortTeams;
}

/** What one team size card says for the count (#2453). */
export type TeamSizeFit =
  | { kind: 'fits' }
  /** Too few players: «trenger 6». */
  | { kind: 'needs'; players: number }
  /** Enough players, but the size does not split them: «går ikke opp med 10». */
  | { kind: 'notWith'; count: number };

/**
 * Whether one team size card can be picked at `count` players (#2453). It
 * fits when it is one of `teamSizesThatFit`. Otherwise it needs the fewest
 * players the size takes (`fewestPlayersForSize`: Texas à 3 → 5, à 4 → 7,
 * 4BBB → 2) when the count is below that, and does not fit the count when it
 * is at or above it. No count, or no size that fits, makes every card fit, so
 * the picker shows everything as before.
 */
export function teamSizeFit(mode: GameMode, size: number, count: number | null): TeamSizeFit {
  if (count === null) return { kind: 'fits' };
  const fitting = teamSizesThatFit(mode, count);
  if (fitting.length === 0 || fitting.includes(size)) return { kind: 'fits' };
  const needed = fewestPlayersForSize(mode, size);
  return count < needed ? { kind: 'needs', players: needed } : { kind: 'notWith', count };
}

/**
 * The team size a kompis round starts on once the format is picked, and keeps
 * when the count changes (#2435). `preferred` (the format's default, or the
 * size already chosen) stands when it fits `count`; otherwise the fitting size
 * closest to it, the larger one on a tie. No count, or nothing that fits,
 * keeps `preferred`. The rule lives here and reads only `teamSizesThatFit`,
 * so it covers Stableford too (#2453): 4BBB with 4, the count to 5 → solo.
 */
export function startTeamSize(mode: GameMode, count: number | null, preferred: number): number {
  if (count === null) return preferred;
  const fits = teamSizesThatFit(mode, count);
  if (fits.length === 0 || fits.includes(preferred)) return preferred;
  return fits.reduce((best, size) => {
    const d = Math.abs(size - preferred);
    const bestD = Math.abs(best - preferred);
    return d < bestD || (d === bestD && size > best) ? size : best;
  });
}

/**
 * Kan `n` spillere fordeles på lag i dette formatet? Sant når minst én
 * støttet lagstørrelse går opp (`teamSizesThatFit`, så regelen bor ett sted),
 * også med lag på én spiller mindre der formatet har den størrelsen (#2569).
 * Kalles bare for scramble-familien. Stableford svarer også sant her for
 * 1–40 (#2453), men `fitsPlayerCount` har sin egen regel for Stableford.
 *
 * Eksempler for Texas (2/3/4 per lag): 4 ✓ (2 lag à 2), 5 ✓ (3/2), 10 ✓
 * (5 lag à 2), 11 ✓ (4/4/3), 39 ✓ (13 lag à 3), 40 ✓ (20 par / 10 lag à 4),
 * 41 ✗ (over taket i alle størrelser).
 */
export function fitsTeamFormat(mode: GameMode, n: number): boolean {
  return teamSizesThatFit(mode, n).length > 0;
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
 * Is the roster full (#2291)? The one home for «full» on the organiser's
 * surfaces: adding a player or a guest, the invite section, «Styr spillere»
 * and the signups page all compare active `game_players` rows to the cap
 * here. A game without a cap is never full.
 */
export function isRosterFull(cap: number | null, activeRosterCount: number): boolean {
  return cap !== null && activeRosterCount >= cap;
}

/**
 * How many teams «Trekk tilfeldig» deals `n` selected players into at the
 * chosen `teamSize`, or `null` when the draw must refuse (#2012): every team
 * in `allowed` (`splitIntoTeams`; the scramble family passes
 * `allowedTeamSizes`, so 11 à 4 deals 4/4/3, #2569), and no more teams than
 * the cap allows at that size. Without `allowed`, every team is full.
 *
 * `fitsTeamFormat` cannot answer this. It asks whether ANY supported size
 * fits, so 12 players pass through size 3 even when the organiser has
 * switched to pairs and a draw would deal six teams. It also does not know
 * best ball, says yes to Stableford whenever solo fits (#2453), even for an
 * odd count no pair draw can deal, and it demands two teams in the scramble
 * family, while best ball has always let a single pair be drawn.
 */
export function randomDrawTeamCount(
  teamSize: number,
  n: number,
  allowed: ReadonlySet<number> = new Set([teamSize]),
): number | null {
  if (!Number.isInteger(teamSize) || teamSize < 2) return null;
  const split = splitIntoTeams(n, teamSize, allowed);
  if (split === null) return null;
  return split.length <= maxTeamsForSize(teamSize) ? split.length : null;
}
