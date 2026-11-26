import type { GameModeConfig } from './modes/types';

export interface TeamForRanking {
  id: number;
  holes: number[];  // length 18 expected
  /**
   * #2940 F5: count back on these per-hole scores minus a fraction of the
   * handicap (Committee Procedures 5A(6)(d)). Slot i is the same hole as in
   * `holes`; `null` = not played. The total is always the sum of `holes`.
   */
  countback?: { holes: (number | null)[]; courseHandicap: number };
}

/**
 * The tie-break step that split a row from the row directly above it (#2579).
 * The finished board says «avgjort på siste ni» from it. `front6`, `front3`
 * and `hole9` are holes 4-9, 7-9 and 9, the rule book's steps after hole 18
 * (#2940).
 */
export type TieDecider =
  | 'total'
  | 'back9'
  | 'back6'
  | 'back3'
  | 'hole18'
  | 'front6'
  | 'front3'
  | 'hole9';

export interface RankedTeam {
  id: number;
  holes: number[];
  rank: number;
  total: number;
  tiedWith: number[];
  /**
   * The step that split this row from the row directly above it in sorted
   * order. `null` on the first row and on a true tie (the row above is then
   * in `tiedWith`).
   */
  decidedBy: TieDecider | null;
}

/** A step reads slots `from` up to, not including, `to` (slot i is hole i+1). */
interface TieStep {
  decider: TieDecider;
  from: number;
  to: number;
}

const TIE_STEPS: readonly TieStep[] = [
  { decider: 'total', from: 0, to: 18 },
  { decider: 'back9', from: 9, to: 18 },
  { decider: 'back6', from: 12, to: 18 },
  { decider: 'back3', from: 15, to: 18 },
  { decider: 'hole18', from: 17, to: 18 },
];

/**
 * #2940 F4: Committee Procedures 5A(6)(d) goes on after hole 18 — «the last
 * six holes, three holes and final hole of the first nine holes».
 */
const RULEBOOK_TIE_STEPS: readonly TieStep[] = [
  ...TIE_STEPS,
  { decider: 'front6', from: 3, to: 9 },
  { decider: 'front3', from: 6, to: 9 },
  { decider: 'hole9', from: 8, to: 9 },
];

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/**
 * The value a team has on one step, lower is better.
 *
 * Without `countback`: the sum of `holes` over the step's slots, as always.
 * With it (#2940 F5) a countback step of k slots is 18 × Σ countback.holes −
 * k × courseHandicap, k/18 of the handicap in whole numbers so `===` holds.
 * A step with an unplayed hole falls back to 18 × Σ holes over the same
 * slots, so the padding of an unplayed hole is never split on handicap. The
 * total is the sum of `holes` either way.
 */
function stepValue(team: TeamForRanking, step: TieStep): number {
  const slots = team.holes.slice(step.from, step.to);
  if (step.decider === 'total' || team.countback === undefined) return sum(slots);
  const { holes, courseHandicap } = team.countback;
  const k = step.to - step.from;
  let gross = 0;
  for (let i = step.from; i < step.to; i += 1) {
    const score = holes[i];
    if (score == null) return 18 * sum(slots);
    gross += score;
  }
  return 18 * gross - k * courseHandicap;
}

/**
 * Ranks lowest first: on the total, then back 9, back 6, back 3 and hole 18.
 * `opts.rulebook` (#2940 F4, a game stamped `countback: 'rulebook'`) goes on
 * to holes 4-9, 7-9 and 9. Rows level on every step share the place.
 */
export function rankTeams(teams: TeamForRanking[], opts?: { rulebook?: boolean }): RankedTeam[] {
  const withCountback = teams.filter((t) => t.countback !== undefined).length;
  if (withCountback !== 0 && withCountback !== teams.length) {
    throw new Error('rankTeams: every team carries countback, or none does (#2940)');
  }
  const steps = opts?.rulebook ? RULEBOOK_TIE_STEPS : TIE_STEPS;
  const withValues = teams.map((t) => ({
    team: t,
    total: sum(t.holes),
    values: steps.map((step) => stepValue(t, step)),
  }));

  const compare = (a: (typeof withValues)[number], b: (typeof withValues)[number]) => {
    for (let s = 0; s < steps.length; s += 1) {
      const diff = a.values[s] - b.values[s];
      if (diff !== 0) return diff;
    }
    return 0;
  };
  withValues.sort(compare);

  return withValues.map((t, i) => {
    const tiedWith = withValues
      .filter((other, j) => j !== i && compare(other, t) === 0)
      .map((o) => o.team.id);
    // Shared rank for ties: find the first index in withValues whose every
    // step value matches this team's. That index + 1 is the rank.
    const firstTiedIndex = withValues.findIndex((other) => compare(other, t) === 0);
    const above = i > 0 ? withValues[i - 1] : null;
    const splitAt = above ? steps.findIndex((_, s) => above.values[s] !== t.values[s]) : -1;
    return {
      id: t.team.id,
      holes: t.team.holes,
      total: t.total,
      rank: firstTiedIndex + 1,
      tiedWith,
      decidedBy: splitAt === -1 ? null : steps[splitAt].decider,
    };
  });
}

/**
 * Padding-verdi for uspilte hull i ranking-arrays som mates til `rankTeams`.
 *
 * `rankTeams` sorterer stigende (lavest sum vinner) og er format-agnostisk —
 * den vet ikke om et lag/en spiller faktisk har spilt. Uten padding ville en
 * deltaker uten ett eneste registrert hull fått sum 0 (laveste = best) og blitt
 * kåret som vinner (#635). Ved å erstatte uspilte hull med en stor verdi
 * rangeres de som verre enn enhver realistisk score. 999 er trygt: et hull med
 * 999 slag dominerer alle realistiske sammenligninger.
 *
 * `soloStrokeplay`/`nassau` padder ALLE uspilte hull (færre spilte hull
 * rangerer dårligere) — med mindre spillet rangerer mot par (#2253, #2625). Lag-strokeplay-formatene (best ball, texas/ambrose/
 * florida, shamble) padder kun lag som har spilt NULL hull, slik at delvis
 * spilte lag beholder sin eksisterende rangering.
 */
export const UNPLAYED_PADDING = 999;

/**
 * 18-slot ranking array for `rankTeams`, indexed on HOLE NUMBER (#2217 D5).
 * ETT hjem for regelen: best ball-motoren (`bestBall.ts`, #1441 D11) og
 * tavla/drilldownen/CSV-en (`lib/leaderboard.ts`) leser begge herfra.
 *
 * `rankTeams`' tie-break-cascade (back9/back6/back3/hull 18) leser plass 9–17
 * og antar at plass i er hull i+1. Fylt etter POSISJON havnet et back9-spills
 * hull 10–18 på plass 0–8, og alle lag sto likt på 0 i hvert tie-break-trinn.
 *
 * - plass i er hull i+1
 * - hull utenfor scope (ingen rad, f.eks. 1–9 i et back9-spill) får 0 — de er
 *   ikke «manglende» for laget, de er ikke en del av kampen
 * - et manglende hull i scope får 0 når laget har spilt minst ett hull i
 *   scope, ellers `UNPLAYED_PADDING` (#635: sum 0 skal ikke kåre en vinner)
 */
export function rankingHolesByNumber(
  holes: ReadonlyArray<{ holeNumber: number; teamNet: number | null }>,
): number[] {
  const playedAny = holes.some((h) => h.teamNet != null);
  const teamNetByHoleNumber = new Map(holes.map((h) => [h.holeNumber, h.teamNet]));
  return Array.from({ length: 18 }, (_, i) => {
    const holeNumber = i + 1;
    if (!teamNetByHoleNumber.has(holeNumber)) return 0;
    return teamNetByHoleNumber.get(holeNumber) ?? (playedAny ? 0 : UNPLAYED_PADDING);
  });
}

/**
 * #2253 / #2625: the formats that can rank on net to par — solo strokeplay,
 * the team strokeplay formats and Nassau (each section). New games of these
 * kinds are stamped with `ranking: 'net_to_par'` (`stampNewGameModeConfig`).
 *
 * #2738: not the points formats (stableford, modified stableford, patsome).
 * They rank on points only, also the games #2625 stamped with the flag from
 * 21.10 to 31.10.2026: this list is why the engine ignores it there.
 */
const NET_TO_PAR_KINDS = [
  'solo_strokeplay',
  'best_ball',
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'shamble',
  'nassau',
] as const satisfies readonly GameModeConfig['kind'][];

export type NetToParModeConfig = Extract<
  GameModeConfig,
  { kind: (typeof NET_TO_PAR_KINDS)[number] }
>;

/** True for a format that can carry the net-to-par flag. */
export function supportsNetToParRanking(modeConfig: GameModeConfig): modeConfig is NetToParModeConfig {
  return (NET_TO_PAR_KINDS as readonly string[]).includes(modeConfig.kind);
}

/**
 * #2253 / #2625: true when the game ranks on net to par (`mode_config.ranking`).
 * The one home for the question — the engine, the boards and the result
 * surfaces all ask it here, so they cannot disagree on a game's rule.
 */
export function ranksByNetToPar(modeConfig: GameModeConfig): boolean {
  return supportsNetToParRanking(modeConfig) && modeConfig.ranking === 'net_to_par';
}

/**
 * #2940: the formats that rank through `rankTeams`. New games of these kinds
 * are stamped with `countback: 'rulebook'` (`stampNewGameModeConfig`).
 */
const COUNTBACK_KINDS = [
  'solo_strokeplay',
  'stableford',
  'modified_stableford',
  'best_ball',
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'shamble',
  'patsome',
  'nassau',
] as const satisfies readonly GameModeConfig['kind'][];

export type CountbackModeConfig = Extract<
  GameModeConfig,
  { kind: (typeof COUNTBACK_KINDS)[number] }
>;

/** True for a format that can carry the countback stamp. */
export function supportsRulebookCountback(modeConfig: GameModeConfig): modeConfig is CountbackModeConfig {
  return (COUNTBACK_KINDS as readonly string[]).includes(modeConfig.kind);
}

/**
 * #2940: true when the game counts back by Committee Procedures 5A(6)(d)
 * (`mode_config.countback`). The one home for the question, like
 * `ranksByNetToPar`. A game without the stamp keeps the five steps and the
 * net hole-by-hole countback it was played with.
 */
export function countsBackByRulebook(modeConfig: GameModeConfig): boolean {
  return supportsRulebookCountback(modeConfig) && modeConfig.countback === 'rulebook';
}
