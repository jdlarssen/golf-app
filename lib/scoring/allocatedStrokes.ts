// Tildelte slag slik motoren regner dem (#2218) — ett hjem for regelen som
// hullsiden, scorekortet, «Hull for hull» og appen viser.
//
// Det frosne banehandicapet (`game_players.course_handicap`) er rått. Noen
// format fordeler et annet tall over SI: fourball og round robin tar allowance
// fra `mode_config.allowance_pct`, og brutto-valget i pott- og lagformatene gir
// 0 slag. Visningene leste før det rå tallet, så kortet ga slag motoren ikke
// regnet med, og flighten trodde et hull var delt som tavla ga bort.
//
// Motorfilene eier fortsatt sin egen lesing. `allocatedStrokes.test.ts` kjører
// de ekte motorene og binder hjelperne her til dem: endrer en motor hvordan den
// leser allowance eller brutto, blir paritetstesten rød (AGENTS.md trap 4).

import { applyAllowance } from './courseHandicap';
import { chapmanSideHandicap, combinedSideHandicap } from './modes/foursomesMatchplay';
import type { SideHandicapFn } from './modes/foursomesMatchplay';
import { greensomeTeamHandicap, readTeamStrokesOverride } from './modes/greensomeMatchplay';
import type { GameMode, GameModeConfig } from './modes/types';

/** `allowance_pct` for `kind`, or the engine's fallback when the kind differs or the field is missing. */
function readAllowancePct(
  config: GameModeConfig,
  kind: GameModeConfig['kind'],
  fallback: number,
): number {
  if (config.kind !== kind) return fallback;
  const raw = (config as { allowance_pct?: number }).allowance_pct;
  return typeof raw === 'number' ? raw : fallback;
}

/** True when the format's brutto option is on. Read like the engines: cast, no kind check. */
function isGross(config: GameModeConfig, field: string): boolean {
  return (config as unknown as Record<string, unknown>)[field] === 'gross';
}

/**
 * Handicapet motoren fordeler over SI for én spiller i formatene med ett kort
 * per spiller. `strokesForHole(playerStrokeHandicap(...), si)` er slagene
 * spilleren får på hullet.
 *
 * - Fourball: `applyAllowance(ch, allowance_pct)`, fallback 100 (`fourballMatchplay.ts`).
 * - Round robin: samme, fallback 85 (`roundRobin.ts`).
 * - Skins, nassau, nines, acey deucey, shamble og patsome: 0 i brutto, ellers `ch`.
 * - Wolf: 0 når `wolf_scoring` er brutto, ellers `ch`.
 * - Best ball, stableford-familien, singles, solo slagspill og BBB: `ch` rått.
 *   BBB bruker ikke slag i motoren; kortet beholder fullt banehandicap.
 *
 * Lagkort-formatene (scramble-familien og alternate shot) gir `ch` her. Lag-
 * slagene i alternate shot regnes i `alternateShotSideExtras`, scramble-slagene
 * i scramble-grenene på hullsiden og scorekortet, og patsome-raden gjelder bare
 * hull 1–6 — lag-slagene på hull 7–18 regnes i patsome-grenene. Den generiske
 * «Hull for hull»-drilldownen og CSV-eksporten kaller likevel hjelperen for alle
 * format, og for lagformatene får de da rått banehandicap (akseptert i #2218).
 */
export function playerStrokeHandicap(
  mode: GameMode,
  config: GameModeConfig,
  courseHandicap: number,
): number {
  switch (mode) {
    case 'fourball_matchplay':
      return applyAllowance(
        courseHandicap,
        readAllowancePct(config, 'fourball_matchplay', 100),
      );
    case 'round_robin':
      return applyAllowance(courseHandicap, readAllowancePct(config, 'round_robin', 85));
    case 'skins':
      return isGross(config, 'skins_scoring') ? 0 : courseHandicap;
    case 'nassau':
      return isGross(config, 'nassau_scoring') ? 0 : courseHandicap;
    case 'nines':
      return isGross(config, 'nines_scoring') ? 0 : courseHandicap;
    case 'acey_deucey':
      return isGross(config, 'acey_deucey_scoring') ? 0 : courseHandicap;
    case 'shamble':
      return isGross(config, 'shamble_scoring') ? 0 : courseHandicap;
    case 'patsome':
      return isGross(config, 'patsome_scoring') ? 0 : courseHandicap;
    case 'wolf':
      return config.kind === 'wolf' && config.wolf_scoring === 'gross' ? 0 : courseHandicap;
    case 'best_ball':
    case 'stableford':
    case 'modified_stableford':
    case 'singles_matchplay':
    case 'solo_strokeplay':
    case 'bingo_bango_bongo':
    case 'texas_scramble':
    case 'ambrose':
    case 'florida_scramble':
    case 'foursomes_matchplay':
    case 'greensome_matchplay':
    case 'chapman_matchplay':
    case 'gruesome_matchplay':
      return courseHandicap;
    default: {
      // `never` keeps a new GameMode a compile error. At runtime an unknown
      // mode (older app binary, seed before deploy) keeps the raw number.
      const _exhaustive: never = mode;
      return courseHandicap;
    }
  }
}

interface AlternateShotRule {
  sideHcp: SideHandicapFn;
  /** Same combination over any number of players — draft state, where a side is not yet 2. */
  sideHcpAny: (chs: readonly number[]) => number;
  allowancePct: number;
}

const sum = (chs: readonly number[]): number => chs.reduce((s, ch) => s + ch, 0);

const sixtyForty = (chs: readonly number[]): number =>
  chs.length === 0 ? 0 : Math.round(0.6 * Math.min(...chs) + 0.4 * Math.max(...chs));

function alternateShotRule(mode: GameMode, config: GameModeConfig): AlternateShotRule | null {
  switch (mode) {
    case 'foursomes_matchplay':
      return {
        sideHcp: combinedSideHandicap,
        sideHcpAny: sum,
        allowancePct: readAllowancePct(config, 'foursomes_matchplay', 100),
      };
    case 'greensome_matchplay':
      return {
        sideHcp: greensomeTeamHandicap,
        sideHcpAny: sixtyForty,
        allowancePct: readAllowancePct(config, 'greensome_matchplay', 100),
      };
    case 'chapman_matchplay':
      return {
        sideHcp: chapmanSideHandicap,
        sideHcpAny: sixtyForty,
        allowancePct: readAllowancePct(config, 'chapman_matchplay', 100),
      };
    case 'gruesome_matchplay':
      return {
        sideHcp: combinedSideHandicap,
        sideHcpAny: sum,
        allowancePct: readAllowancePct(config, 'gruesome_matchplay', 50),
      };
    default:
      return null;
  }
}

/**
 * Lag-slagene i alternate shot (foursomes, greensome, chapman og gruesome),
 * regnet som `computeFoursomesCore`: sidens lag-handicap (sum eller 60/40),
 * erstattet av arrangørens `team_strokes_override` når den er satt (greensome,
 * #1441), så `round(|diff| × allowance_pct / 100)` til høylaget og 0 til
 * lavlaget. `side1`/`side2` er banehandicapene på lag 1 og lag 2.
 *
 * Har en side ikke nøyaktig to spillere (utkast), brukes sum eller 60/40 over
 * min og maks, og en tom side gir 0 — motoren gir da et tomt skall. Andre
 * format enn alternate shot gir 0 slag til begge.
 */
export function alternateShotSideExtras(
  mode: GameMode,
  config: GameModeConfig,
  side1: readonly number[],
  side2: readonly number[],
): { side1Extra: number; side2Extra: number } {
  const rule = alternateShotRule(mode, config);
  if (!rule) return { side1Extra: 0, side2Extra: 0 };

  const sideHandicap = (chs: readonly number[]): number =>
    chs.length === 2 ? rule.sideHcp(chs[0], chs[1]) : rule.sideHcpAny(chs);

  // Only greensome passes the override to the core; the other three never do.
  const override =
    mode === 'greensome_matchplay' ? readTeamStrokesOverride(config) : undefined;
  const side1Combined = override?.side1 ?? sideHandicap(side1);
  const side2Combined = override?.side2 ?? sideHandicap(side2);

  const highSideExtra = Math.round(
    (Math.abs(side1Combined - side2Combined) * rule.allowancePct) / 100,
  );
  const highSide: 1 | 2 = side2Combined > side1Combined ? 2 : 1;
  return {
    side1Extra: highSide === 1 ? highSideExtra : 0,
    side2Extra: highSide === 2 ? highSideExtra : 0,
  };
}
