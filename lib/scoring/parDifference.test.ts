// #2941 (F17): the extra strokes for a higher par in match play. NGF 6.2b(i)
// s. 56: «En spiller som konkurrerer fra et utslagssted med en høyere par må få
// tilleggsslag for runden, lik differansen mellom par», added as «Spillehandicap
// x handicapgodtgjørelse + Forskjell i par». Vedlegg C s. 76: after the
// allowance, the lowest playing handicap plays off zero.

import { describe, expect, it } from 'vitest';
import { holesForSegment } from './holeSegment';
import { parDifferenceStrokes, usesParDifference, withParDifference } from './parDifference';
import type { GameModeConfig } from './modes/types';
import { MIXED_PAR_18 as MIXED } from './__fixtures__/mixedPar';

describe('parDifferenceStrokes', () => {
  it('gir 0 når alle spiller samme par', () => {
    expect(parDifferenceStrokes(MIXED, 'mens', ['mens', 'mens'])).toBe(0);
    expect(parDifferenceStrokes(MIXED, 'ladies', ['ladies'])).toBe(0);
  });

  it('gir damen på par 74 to slag mot herren på par 72, og herren 0', () => {
    expect(parDifferenceStrokes(MIXED, 'ladies', ['mens', 'ladies'])).toBe(2);
    expect(parDifferenceStrokes(MIXED, 'mens', ['mens', 'ladies'])).toBe(0);
  });

  it('teller bare hullene i scope: forsiden har begge damehullene, baksiden ingen', () => {
    expect(parDifferenceStrokes(holesForSegment(MIXED, 'front9'), 'ladies', ['mens', 'ladies'])).toBe(2);
    expect(parDifferenceStrokes(holesForSegment(MIXED, 'back9'), 'ladies', ['mens', 'ladies'])).toBe(0);
  });

  it('med tre utslagssteder får hver forskjellen til den laveste par', () => {
    const three = MIXED.map((h, i) => ({
      ...h,
      parByGender: { mens: 4, ladies: i < 2 ? 5 : 4, juniors: i < 1 ? 5 : 4 },
    }));
    const tees = ['mens', 'ladies', 'juniors'] as const;
    expect(tees.map((t) => parDifferenceStrokes(three, t, tees))).toEqual([0, 2, 1]);
  });

  it('gir 0 uten par per kjønn, og en ukjent tee leser herrenes par', () => {
    const plain = MIXED.map(({ parByGender: _ignored, ...h }) => h);
    expect(parDifferenceStrokes(plain, 'ladies', ['mens', 'ladies'])).toBe(0);
    expect(parDifferenceStrokes(MIXED, undefined, ['ladies'])).toBe(0);
    expect(parDifferenceStrokes(MIXED, 'ladies', [undefined])).toBe(2);
  });

  it('gir 0 uten hull', () => {
    expect(parDifferenceStrokes([], 'ladies', ['mens'])).toBe(0);
  });
});

describe('withParDifference', () => {
  it('legger forskjellen i par til slagene, og den laveste spiller på null', () => {
    // Both on 0: the lady gets her 2.
    expect(withParDifference([0, 0], [0, 2])).toEqual([0, 2]);
    // Four-ball at 90 %, C/2 example 2, with D on the higher par: 26 + 2.
    expect(withParDifference([0, 7, 15, 26], [0, 0, 0, 2])).toEqual([0, 7, 15, 28]);
  });

  it('når spilleren med høyest par har lavest handicap, spiller hun på null og de andre får differansen', () => {
    // Lady 10 (+2 = 12) against a man on 14: she plays off 0, he gets 2.
    expect(withParDifference([0, 4], [2, 0])).toEqual([0, 2]);
    // Lady 10 (+2 = 12) against a man on 11: he plays off 0, she gets 1.
    expect(withParDifference([0, 1], [2, 0])).toEqual([1, 0]);
  });

  it('endrer ingenting når ingen har forskjell i par', () => {
    expect(withParDifference([0, 7, 15, 26], [0, 0, 0, 0])).toEqual([0, 7, 15, 26]);
  });
});

describe('usesParDifference', () => {
  const singles = (extra: object): GameModeConfig =>
    ({ kind: 'singles_matchplay', team_size: 1, teams_count: 2, ...extra }) as GameModeConfig;

  it('gjelder en ny singel-, four-ball- og Round Robin-match med begge merkene', () => {
    expect(usesParDifference(singles({ match_strokes: 'difference', par_strokes: 'difference' }))).toBe(true);
    expect(
      usesParDifference({
        kind: 'fourball_matchplay',
        team_size: 2,
        teams_count: 2,
        allowance_pct: 90,
        match_strokes: 'difference',
        par_strokes: 'difference',
      }),
    ).toBe(true);
    expect(
      usesParDifference({
        kind: 'round_robin',
        team_size: 1,
        teams_count: 4,
        allowance_pct: 90,
        match_strokes: 'difference',
        par_strokes: 'difference',
      }),
    ).toBe(true);
  });

  it('gjelder foursomes-familien med merket', () => {
    for (const kind of ['foursomes_matchplay', 'greensome_matchplay', 'chapman_matchplay', 'gruesome_matchplay'] as const) {
      expect(
        usesParDifference({ kind, team_size: 2, teams_count: 2, allowance_pct: 50, par_strokes: 'difference' } as GameModeConfig),
      ).toBe(true);
    }
  });

  it('gjelder ikke en match uten merket, og ikke en match der hver får sine egne slag', () => {
    expect(usesParDifference(singles({ match_strokes: 'difference' }))).toBe(false);
    expect(usesParDifference(singles({ par_strokes: 'difference' }))).toBe(false);
    expect(
      usesParDifference({ kind: 'foursomes_matchplay', team_size: 2, teams_count: 2, allowance_pct: 50 }),
    ).toBe(false);
  });

  it('gjelder ikke andre format', () => {
    expect(
      usesParDifference({ kind: 'solo_strokeplay', team_size: 1, par_strokes: 'difference' } as unknown as GameModeConfig),
    ).toBe(false);
  });
});
