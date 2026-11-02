import { describe, expect, it } from 'vitest';
import type { PlannedBundleMatch } from './cupPairing';
import {
  adjustedSessionOverrides,
  buildSubmissionMatches,
  canAdvanceRoster,
  changeMatchPlayer,
  effectiveStrokes,
  generateMatchPlan,
  plannedMatchTotal,
  rosterBlock,
  sessionCountRowsFor,
  type MatchPlanSetup,
} from './matchPlan';
import {
  PARITY_PRESET_IDS,
  PARITY_TEAM_1,
  PARITY_TEAM_2,
  PARITY_TEE,
} from './testing/matchPlanParity';
import expected from './testing/matchPlanParity.expected.json';

/**
 * Type A (#2752): det rene nettets veiviser og appen deler. Fasiten i
 * `matchPlanParity.expected.json` er det begge flatene skal sende, se testene av
 * `GenerateMatchesWizard` og `CupGenerate`.
 */

const setupFor = (presetId: string): MatchPlanSetup => ({ presetId, customSessions: [], strategy: 'handicap' });

function submission(presetId: string) {
  const setup = setupFor(presetId);
  const matches = generateMatchPlan({
    setup,
    team1Players: PARITY_TEAM_1,
    team2Players: PARITY_TEAM_2,
    overrides: {},
  });
  return buildSubmissionMatches({
    presetId,
    matches,
    team1Players: PARITY_TEAM_1,
    team2Players: PARITY_TEAM_2,
    selectedTee: PARITY_TEE,
    teamStrokesInputs: {},
  });
}

describe('fasiten for de fire oppsettene', () => {
  it.each(PARITY_PRESET_IDS)('%s', (presetId) => {
    expect(submission(presetId)).toEqual(expected[presetId]);
  });

  it('delt dag: greensomen har slagene ferdig utfylt, og avledede singler peker på best ballen', () => {
    const matches = submission('splittet-cup-dag') as PlannedBundleMatch[];
    const greensome = matches.filter((m) => m.format === 'greensome_matchplay');
    expect(greensome).toHaveLength(2);
    for (const m of greensome) {
      expect(Number.isInteger((m as { teamStrokesOverride?: { team1: number } }).teamStrokesOverride?.team1)).toBe(true);
    }
    const hosts = new Set(matches.filter((m) => m.format === 'best_ball').map((m) => m.id));
    const derived = matches.filter((m) => m.sourceId);
    expect(derived).toHaveLength(4);
    expect(derived.every((m) => hosts.has(m.sourceId as string))).toBe(true);
  });
});

describe('antall og hva som stopper «Neste»', () => {
  it('teller matcher for et oppsett, og delt dag etter flightene', () => {
    expect(plannedMatchTotal(setupFor('singler'), 4, 4, {})).toBe(4);
    expect(plannedMatchTotal(setupFor('singler'), 4, 2, {})).toBe(2);
    expect(plannedMatchTotal(setupFor('splittet-cup-dag'), 4, 4, {})).toBe(8);
  });

  it('for få på et lag sier hvilket lag', () => {
    const setup = setupFor('klassisk');
    expect(rosterBlock(setup, 1, 2, 3)).toEqual({ kind: 'team_min', side: 'team1', minPerTeam: 2 });
    expect(rosterBlock(setup, 2, 1, 3)).toEqual({ kind: 'team_min', side: 'team2', minPerTeam: 2 });
    expect(rosterBlock(setup, 2, 2, 0)).toEqual({ kind: 'zero_matches' });
    expect(rosterBlock(setup, 2, 2, 3)).toBeNull();
  });

  it('over taket stopper, uten å være en grunn i rosterBlock', () => {
    const setup = setupFor('singler');
    expect(canAdvanceRoster(setup, 4, 4, 4, 4)).toBe(true);
    expect(canAdvanceRoster(setup, 4, 4, 5, 4)).toBe(false);
    expect(canAdvanceRoster(setup, 4, 4, 5, undefined)).toBe(true);
  });

  it('en nedjustering tilbake på taket er ingen overstyring', () => {
    const setup = setupFor('singler');
    const [row] = sessionCountRowsFor(setup, 4, 4, {});
    const lower = adjustedSessionOverrides({}, row, -1);
    expect(lower).toEqual({ [row.index]: 3 });
    const [lowered] = sessionCountRowsFor(setup, 4, 4, lower);
    expect(lowered.effective).toBe(3);
    expect(adjustedSessionOverrides(lower, lowered, 1)).toEqual({});
  });

  it('bytte i forhåndsvisningen rører bare den plassen', () => {
    const matches = generateMatchPlan({
      setup: setupFor('singler'),
      team1Players: PARITY_TEAM_1,
      team2Players: PARITY_TEAM_2,
      overrides: {},
    });
    const changed = changeMatchPlayer(matches, matches[0].id, 'side1', 0, 'nord-4');
    expect(changed[0].side1).toEqual(['nord-4']);
    expect(changed[1]).toBe(matches[1]);
  });
});

describe('effectiveStrokes', () => {
  it.each([
    [undefined, 7, 7],
    ['', 7, 7],
    ['  ', 7, 7],
    ['1,5', 7, 7],
    ['-1', 7, 7],
    ['12', 7, 12],
    ['0', 7, 0],
  ] as const)('%s med forslag %s gir %s', (raw, fallback, want) => {
    expect(effectiveStrokes(raw, fallback)).toBe(want);
  });
});
