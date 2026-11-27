import { describe, expect, it } from 'vitest';
import { ambroseDefaultPct } from '@/lib/scoring/modes/ambrose';
import { defaultFloridaHandicapPct } from '@/lib/scoring/modes/floridaScramble';
import {
  DEFAULT_SHAMBLE_SETUP,
  defaultHcpAllowancePct,
  defaultMatchAllowancePct,
  defaultPatsomeFourballAllowancePct,
  defaultTeamHandicapPct,
  defaultTeamHandicapRule,
  offersNgfWeighting,
  defaultTeamSizeForMode,
  defaultTexasHandicapPct,
} from './formatSetupDefaults';

/** Type A (#2753): the wizard defaults the web and the app share. */
describe('formatSetupDefaults', () => {
  it.each([
    ['texas_scramble', 4],
    ['ambrose', 4],
    ['florida_scramble', 3],
    ['shamble', 4],
    ['patsome', 2],
    ['solo_strokeplay', 1],
  ] as const)('%s starter på lag à %i', (mode, size) => {
    expect(defaultTeamSizeForMode(mode)).toBe(size);
  });

  it('Texas følger NGF: 25, 15 og 10 % av summen for 2, 3 og 4', () => {
    expect([2, 3, 4].map((n) => defaultTexasHandicapPct(n as 2 | 3 | 4))).toEqual([25, 15, 10]);
  });

  it('lag-handicapet per format er formatets egen standard', () => {
    expect(defaultTeamHandicapPct('texas_scramble', 4)).toBe(10);
    expect(defaultTeamHandicapPct('ambrose', 3)).toBe(ambroseDefaultPct(3));
    expect(defaultTeamHandicapPct('florida_scramble', 3)).toBe(defaultFloridaHandicapPct(3));
    expect(defaultTeamHandicapPct('shamble', 4)).toBeNull();
  });

  // #2942: NGF vedlegg C, s. 75 — four-ball slagspill og four-ball stableford
  // 85 %, individuelt slagspill og individuell stableford 100 %.
  it.each([
    ['best_ball', 2, 85],
    ['stableford', 1, 100],
    ['stableford', 2, 85],
    ['modified_stableford', 1, 100],
    ['modified_stableford', 2, 85],
    ['solo_strokeplay', 1, 100],
    ['singles_matchplay', 1, 100],
    ['shamble', 4, 100],
  ] as const)('%s med lag à %i starter på %i % handicap', (mode, size, pct) => {
    expect(defaultHcpAllowancePct(mode, size)).toBe(pct);
  });

  it('shamble starter som shamble, to teller, netto', () => {
    expect(DEFAULT_SHAMBLE_SETUP).toEqual({ variant: 'shamble', count: 2, scoring: 'net' });
  });
});

// #2997 (F18): the share a match format with its own field starts on. NGF
// vedlegg C s. 75: four-ball match play 90 %; Round Robin is four-ball with
// rotating partners and follows it. The owner, 23.11: «det starter på 90% i
// stedet for 85%, så kan arrangør alltids gjøre endringer.»
describe('defaultMatchAllowancePct (#2997, F18)', () => {
  it.each([
    ['fourball_matchplay', 90],
    ['round_robin', 90],
    ['foursomes_matchplay', 50],
    ['greensome_matchplay', 100],
    ['chapman_matchplay', 100],
    ['gruesome_matchplay', 50],
  ] as const)('%s starts on %i %%', (mode, pct) => {
    expect(defaultMatchAllowancePct(mode)).toBe(pct);
  });
});

// #3002: new Texas and Florida games start on NGF's weighting per player
// (F23); Ambrose keeps its formula (the owner, 24.11). Patsome plays holes
// 1–6 on 85 % (F24).
describe('defaultTeamHandicapRule (#3002, F23)', () => {
  it.each([
    ['texas_scramble', 'ngf'],
    ['florida_scramble', 'ngf'],
    ['ambrose', 'pct'],
    ['best_ball', null],
    ['patsome', null],
  ] as const)('%s → %s', (mode, expected) => {
    expect(defaultTeamHandicapRule(mode)).toBe(expected);
  });
});

describe('defaultPatsomeFourballAllowancePct (#3002, F24)', () => {
  it('is 85, NGF vedlegg C s. 75 for four-ball stableford', () => {
    expect(defaultPatsomeFourballAllowancePct()).toBe(85);
  });
});

// #3002: Ambrose's «Standard» is its formula (the owner 27.11.2026, «B:
// formelen»), so only Texas and Florida offer NGF's weighting.
describe('offersNgfWeighting (#3002)', () => {
  it.each([
    ['texas_scramble', true],
    ['florida_scramble', true],
    ['ambrose', false],
    ['best_ball', false],
  ] as const)('%s → %s', (mode, expected) => {
    expect(offersNgfWeighting(mode)).toBe(expected);
  });

  it('a format that starts on the weighting offers it', () => {
    for (const mode of ['texas_scramble', 'ambrose', 'florida_scramble'] as const) {
      if (defaultTeamHandicapRule(mode) === 'ngf') expect(offersNgfWeighting(mode)).toBe(true);
    }
  });
});
