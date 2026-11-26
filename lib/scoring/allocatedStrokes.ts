// Tildelte slag slik motoren regner dem (#2218) — ett hjem for regelen som
// hullsiden, scorekortet, «Hull for hull» og appen viser.
//
// Det frosne banehandicapet (`game_players.course_handicap`) er rått. Noen
// format fordeler et annet tall over SI: fourball og round robin tar allowance
// fra `mode_config.allowance_pct` (i en ny match av differansen til den
// laveste, #2997), og brutto-valget i pott- og lagformatene gir 0 slag. Formatene
// med egen prosent tar den av det urundede banehandicapet når starten frøs det
// (`raw_course_handicap`, `strokeBasis`). Visningene leste før det rå tallet, så kortet ga slag motoren ikke
// regnet med, og flighten trodde et hull var delt som tavla ga bort.
//
// Motorfilene eier fortsatt sin egen lesing. `allocatedStrokes.test.ts` kjører
// de ekte motorene og binder hjelperne her til dem: endrer en motor hvordan den
// leser allowance eller brutto, blir paritetstesten rød (AGENTS.md trap 4).

import { pickTeamCaptain } from '@/lib/games/teamCaptain';
import { applyAllowance, strokeBasis } from './courseHandicap';
import { matchDifferenceStrokes } from './matchStrokes';
import { alternateShotExtras, alternateShotSideStrokes } from './modes/foursomesMatchplay';
import { readTeamStrokesOverride } from './modes/greensomeMatchplay';
import { asScoringGender } from './modes/parResolver';
import { singlesStrokeHandicap } from './modes/singlesMatchplay';
import type { GameMode, GameModeConfig, ScoringGender, ScoringHole } from './modes/types';
import { parDifferenceStrokes, usesParDifference, withParDifference } from './parDifference';
import { sideHandicap, type SidePlayer, type SideRule } from './teamHandicap';

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
function isGross(config: GameModeConfig, field: GrossField): boolean {
  return (config as unknown as Record<string, unknown>)[field] === 'gross';
}

type GrossField =
  | 'skins_scoring'
  | 'nassau_scoring'
  | 'nines_scoring'
  | 'acey_deucey_scoring'
  | 'shamble_scoring'
  | 'patsome_scoring';

type StrokeRule =
  | { kind: 'allowance'; configKind: 'fourball_matchplay' | 'round_robin'; fallbackPct: number }
  | { kind: 'gross_option'; field: GrossField }
  | { kind: 'wolf' }
  | { kind: 'raw' };

/**
 * Which rule the engine uses for a mode. Exhaustive switch with a `never`
 * check, after `isSoloFormat`: a new GameMode is a compile error here.
 */
function strokeRuleFor(mode: GameMode): StrokeRule {
  switch (mode) {
    case 'fourball_matchplay':
      return { kind: 'allowance', configKind: 'fourball_matchplay', fallbackPct: 100 };
    case 'round_robin':
      return { kind: 'allowance', configKind: 'round_robin', fallbackPct: 85 };
    case 'skins':
      return { kind: 'gross_option', field: 'skins_scoring' };
    case 'nassau':
      return { kind: 'gross_option', field: 'nassau_scoring' };
    case 'nines':
      return { kind: 'gross_option', field: 'nines_scoring' };
    case 'acey_deucey':
      return { kind: 'gross_option', field: 'acey_deucey_scoring' };
    case 'shamble':
      return { kind: 'gross_option', field: 'shamble_scoring' };
    case 'patsome':
      return { kind: 'gross_option', field: 'patsome_scoring' };
    case 'wolf':
      return { kind: 'wolf' };
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
      return { kind: 'raw' };
    default: {
      // At runtime an unknown mode (older app binary, seed before deploy)
      // keeps the raw number.
      const _exhaustive: never = mode;
      return { kind: 'raw' };
    }
  }
}

/**
 * The player's own handicap after the format's allowance or gross option —
 * the number a scorecard header shows. For the strokes on a hole use
 * {@link matchStrokeHandicap}: in a new singles match the strokes come from
 * the difference to the opponent, not from this number.
 *
 * Handicapet motoren fordeler over SI for én spiller i formatene med ett kort
 * per spiller (unntatt singles med `match_strokes: 'difference'`).
 *
 * - Fourball: `applyAllowance(basis, allowance_pct)`, fallback 100
 *   (`fourballMatchplay.ts`). `basis` er det urundede banehandicapet når
 *   starten frøs det, ellers `ch` (`strokeBasis`, #2997).
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
 * «Hull for hull»-drilldownen og CSV-eksporten kaller hjelperen via
 * `bestBallBoardInput`, og siden #2217 når bare best ball dem (rått tall).
 */
export function playerStrokeHandicap(
  mode: GameMode,
  config: GameModeConfig,
  courseHandicap: number,
  rawCourseHandicap?: number | null,
): number {
  const rule = strokeRuleFor(mode);
  switch (rule.kind) {
    case 'allowance':
      // #2997 (F16): the share of the unrounded course handicap when frozen.
      return applyAllowance(
        strokeBasis(courseHandicap, rawCourseHandicap),
        readAllowancePct(config, rule.configKind, rule.fallbackPct),
      );
    case 'gross_option':
      return isGross(config, rule.field) ? 0 : courseHandicap;
    case 'wolf':
      return config.kind === 'wolf' && config.wolf_scoring === 'gross' ? 0 : courseHandicap;
    case 'raw':
      return courseHandicap;
  }
}

/** One player as {@link matchStrokeHandicap} reads them: the frozen integer and, when the start froze it, the unrounded course handicap. */
export interface MatchStrokePlayer {
  courseHandicap: number | null;
  rawCourseHandicap?: number | null;
  /**
   * `game_players.tee_gender`: the par the player plays to, for the extra
   * strokes on a higher par (#2941). Absent or unknown reads men's par.
   */
  teeGender?: string | null;
}

/**
 * Everyone in the match as {@link matchStrokeHandicap} reads them, with the
 * holes in scope (#2941): each player's basis and tee, so a new match can add
 * the difference in par (`par_strokes`) and let the lowest play off zero, as
 * the engine does. Built by {@link matchStrokeField}.
 */
export interface MatchStrokeField {
  players: readonly { basis: number; teeGender: ScoringGender | undefined }[];
  /** The holes in scope (`holesForSegment`), the par is summed over them. */
  holes: readonly ScoringHole[];
}

/** A roster row for {@link matchStrokeBases}. */
export interface MatchRosterRow extends MatchStrokePlayer {
  teamNumber: number | null;
  /** `game_players.withdrawn_at`; absent counts as still playing. */
  withdrawnAt?: string | null;
}

/** True for the match formats where the strokes come from the lowest in the match. */
function isDifferenceMatch(mode: GameMode): boolean {
  return mode === 'singles_matchplay' || mode === 'fourball_matchplay' || mode === 'round_robin';
}

/**
 * What one player's strokes are taken of in a match format: the frozen
 * playing handicap in singles (the general percentage is already in it), the
 * unrounded course handicap in four-ball and Round Robin when the start froze
 * it (`strokeBasis`, #2997). A missing course handicap counts as 0, as
 * everywhere in the views.
 */
function matchBasis(mode: GameMode, player: MatchStrokePlayer): number {
  const ch = player.courseHandicap ?? 0;
  return mode === 'singles_matchplay' ? ch : strokeBasis(ch, player.rawCourseHandicap);
}

/**
 * The numbers {@link matchStrokeHandicap} finds the lowest in the match from,
 * from exactly the players the engine reads:
 *
 * - Singles and four-ball: side 1 and side 2 (`teamNumber === 1` / `=== 2`),
 *   without the withdrawn, as `buildUniformContext` builds the engine's
 *   context (a four-ball side can play on with one ball, #1814).
 * - Round Robin: the four slots 1–4, the withdrawn included, as
 *   `buildRoundRobinContext` keeps them.
 *
 * A roster row on no side, or another team, can then never move the lowest
 * handicap the views use away from the engine's. Other formats give `[]`.
 */
export function matchStrokeBases(
  mode: GameMode,
  players: readonly MatchRosterRow[],
): number[] {
  return inMatchRows(mode, players).map((p) => matchBasis(mode, p));
}

/** The roster rows the engine reads in a difference match (see {@link matchStrokeBases}); `[]` for other formats. */
function inMatchRows(mode: GameMode, players: readonly MatchRosterRow[]): MatchRosterRow[] {
  if (!isDifferenceMatch(mode)) return [];
  return mode === 'round_robin'
    ? players.filter((p) => p.teamNumber != null && p.teamNumber >= 1 && p.teamNumber <= 4)
    : players.filter((p) => (p.teamNumber === 1 || p.teamNumber === 2) && p.withdrawnAt == null);
}

/**
 * {@link matchStrokeBases} with each player's tee and the holes in scope
 * (#2941): what {@link matchStrokeHandicap} needs to add the difference in
 * par. The same players as the engine reads; other formats give no players.
 */
export function matchStrokeField(
  mode: GameMode,
  players: readonly MatchRosterRow[],
  holes: readonly ScoringHole[],
): MatchStrokeField {
  return {
    players: inMatchRows(mode, players).map((p) => ({
      basis: matchBasis(mode, p),
      teeGender: asScoringGender(p.teeGender),
    })),
    holes,
  };
}

/**
 * The handicap the engine spreads over SI for one player in the formats with
 * one card per player: `strokesForHole(matchStrokeHandicap(...), si)` is the
 * strokes the player gets on the hole — what the hole page's dots, the
 * scorecard and the app show.
 *
 * `match` is everyone in the match over the whole roster (the player's own
 * may be included): a {@link MatchStrokeField} from {@link matchStrokeField},
 * or the bare numbers from {@link matchStrokeBases}. Singles, four-ball and
 * Round Robin read it: on a new match the lowest plays off 0 and the others
 * get the share of the difference (`matchDifferenceStrokes`; singles at
 * 100 %, owner-ordered audit 2026-11-20; four-ball and Round Robin #2997).
 * With `par_strokes` (#2941) the field adds each player's difference in par
 * and the lowest then plays off zero (`withParDifference`); the bare numbers
 * carry no tees and give no par strokes. Every other mode returns
 * {@link playerStrokeHandicap}.
 */
export function matchStrokeHandicap(
  mode: GameMode,
  config: GameModeConfig,
  player: MatchStrokePlayer,
  match: MatchStrokeInput,
): number {
  const ch = player.courseHandicap ?? 0;
  if (!isDifferenceMatch(mode)) {
    return playerStrokeHandicap(mode, config, ch, player.rawCourseHandicap);
  }
  const field = isMatchStrokeField(match) ? match : null;
  const own = { basis: matchBasis(mode, player), teeGender: asScoringGender(player.teeGender) };
  const others = isMatchStrokeField(match)
    ? match.players
    : match.map((basis) => ({ basis, teeGender: undefined }));
  const lowestInMatch = Math.min(own.basis, ...others.map((p) => p.basis));
  const rule = strokeRuleFor(mode);
  const pct =
    rule.kind === 'allowance'
      ? readAllowancePct(config, rule.configKind, rule.fallbackPct)
      : 100;
  const strokesOf = (basis: number): number =>
    mode === 'singles_matchplay'
      ? singlesStrokeHandicap(config, basis, lowestInMatch)
      : matchDifferenceStrokes(config, basis, lowestInMatch, pct);
  if (!field || !usesParDifference(config)) return strokesOf(own.basis);
  const all = [own, ...others];
  const tees = all.map((p) => p.teeGender);
  return withParDifference(
    all.map((p) => strokesOf(p.basis)),
    tees.map((tee) => parDifferenceStrokes(field.holes, tee, tees)),
  )[0];
}

/** What {@link matchStrokeHandicap} reads the match from: a field with tees and holes, or the bare numbers. */
export type MatchStrokeInput = readonly number[] | MatchStrokeField;

function isMatchStrokeField(match: MatchStrokeInput): match is MatchStrokeField {
  return !Array.isArray(match);
}

interface AlternateShotRule {
  sideRule: SideRule;
  allowancePct: number;
}

function alternateShotRule(mode: GameMode, config: GameModeConfig): AlternateShotRule | null {
  switch (mode) {
    case 'foursomes_matchplay':
      return {
        sideRule: 'sum',
        allowancePct: readAllowancePct(config, 'foursomes_matchplay', 100),
      };
    case 'greensome_matchplay':
      return {
        sideRule: 'sixtyForty',
        allowancePct: readAllowancePct(config, 'greensome_matchplay', 100),
      };
    case 'chapman_matchplay':
      return {
        sideRule: 'sixtyForty',
        allowancePct: readAllowancePct(config, 'chapman_matchplay', 100),
      };
    case 'gruesome_matchplay':
      return {
        sideRule: 'sum',
        allowancePct: readAllowancePct(config, 'gruesome_matchplay', 50),
      };
    default:
      return null;
  }
}

/**
 * Lag-slagene i alternate shot (foursomes, greensome, chapman og gruesome),
 * regnet som `computeFoursomesCore`: sidens lag-handicap (`sideHandicap`, sum
 * eller 60/40, urundet når starten frøs de urundede tallene, #2997), erstattet
 * av arrangørens `team_strokes_override` når den er satt (greensome, #1441),
 * så `round(|diff| × allowance_pct / 100)` til høylaget og 0 til lavlaget
 * (`alternateShotExtras`). `side1`/`side2` er spillerne på lag 1 og lag 2.
 *
 * Har en side ikke nøyaktig to spillere (utkast), brukes sum eller 60/40 over
 * min og maks, og en tom side gir 0 — motoren gir da et tomt skall. Andre
 * format enn alternate shot gir 0 slag til begge.
 *
 * #2941 (F17): med `par_strokes` legges sidens forskjell i par til, som i
 * motoren (`alternateShotSideStrokes`). Sidens par er kapteinens tee
 * (`pickTeamCaptain` over `userId`), og `holes` er hullene i scope. Uten
 * `holes`, eller uten `userId` og `teeGender` på spillerne, gis ingen
 * par-slag.
 */
export function alternateShotSideExtras(
  mode: GameMode,
  config: GameModeConfig,
  side1: readonly AlternateShotSidePlayer[],
  side2: readonly AlternateShotSidePlayer[],
  holes: readonly ScoringHole[] = [],
): { side1Extra: number; side2Extra: number } {
  const rule = alternateShotRule(mode, config);
  if (!rule) return { side1Extra: 0, side2Extra: 0 };

  // Only greensome passes the override to the core; the other three never do.
  const override =
    mode === 'greensome_matchplay' ? readTeamStrokesOverride(config) : undefined;
  const side1Combined = override?.side1 ?? sideHandicap(rule.sideRule, side1);
  const side2Combined = override?.side2 ?? sideHandicap(rule.sideRule, side2);
  return alternateShotSideStrokes(
    config,
    holes,
    alternateShotExtras(side1Combined, side2Combined, rule.allowancePct),
    captainTee(side1),
    captainTee(side2),
  );
}

/** A side player for {@link alternateShotSideExtras}: `userId` and `teeGender` give the captain's par (#2941). */
export type AlternateShotSidePlayer = SidePlayer & { userId?: string; teeGender?: string | null };

/** The tee of the side's captain (lex-min `userId`, as the engine picks it), or undefined. */
function captainTee(side: readonly AlternateShotSidePlayer[]): ScoringGender | undefined {
  const ids = side.flatMap((p) => (p.userId ? [p.userId] : []));
  if (ids.length === 0) return undefined;
  const captainId = pickTeamCaptain(ids);
  return asScoringGender(side.find((p) => p.userId === captainId)?.teeGender);
}
