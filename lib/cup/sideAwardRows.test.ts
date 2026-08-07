import { describe, it, expect } from 'vitest';
import {
  expandSideAwardConfig,
  groupSideAwardRows,
  isValidSideAward,
  type SideAwardConfigInput,
} from './sideAwardRows';

/**
 * Type A unit tests (#1489) for the pure config↔DB-row mapping that backs
 * multi-winner CTP/LD slots and GIR rows: one config row per (kind, hole)
 * expands to N slot rows (ctp/ld) or one gir row; grouping folds DB rows back
 * to config rows for the admin panel's editable state.
 */

describe('isValidSideAward (#1489)', () => {
  it.each<SideAwardConfigInput>([
    { kind: 'ctp', holeNumber: 4, points: 2, winnerCount: 1 },
    { kind: 'ld', holeNumber: 18, points: 0.5, winnerCount: 10 },
    // Eier-tillegg 2026-08-07: desimalpoeng må være gyldig.
    { kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 3 },
    { kind: 'gir', holeNumber: 1, points: 1, maxPerTeam: 1 },
  ])('gyldig: %j', (a) => {
    expect(isValidSideAward(a)).toBe(true);
  });

  it.each([
    [{ kind: 'ctp', holeNumber: 0, points: 2, winnerCount: 1 }], // hole out of 1..18
    [{ kind: 'ctp', holeNumber: 19, points: 2, winnerCount: 1 }],
    [{ kind: 'ctp', holeNumber: 4, points: 0, winnerCount: 1 }], // points must be > 0
    [{ kind: 'ctp', holeNumber: 4, points: -1, winnerCount: 1 }],
    [{ kind: 'xyz', holeNumber: 4, points: 2, winnerCount: 1 }], // invalid kind
    [{ kind: 'ctp', holeNumber: 4, points: 2, winnerCount: 0 }], // winnerCount 1..10
    [{ kind: 'ctp', holeNumber: 4, points: 2, winnerCount: 11 }],
    [{ kind: 'ctp', holeNumber: 4, points: 2, winnerCount: 1.5 }], // integer only
    [{ kind: 'ctp', holeNumber: 4, points: 2 }], // winnerCount missing
    [{ kind: 'gir', holeNumber: 4, points: 1.5, maxPerTeam: 0 }], // maxPerTeam 1..10
    [{ kind: 'gir', holeNumber: 4, points: 1.5, maxPerTeam: 11 }],
    [{ kind: 'gir', holeNumber: 4, points: 1.5, maxPerTeam: 2.5 }], // integer only
    [{ kind: 'gir', holeNumber: 4, points: 1.5 }], // maxPerTeam missing
  ])('ugyldig: %j', (bad) => {
    expect(isValidSideAward(bad as SideAwardConfigInput)).toBe(false);
  });
});

describe('expandSideAwardConfig (#1489)', () => {
  it('tom liste → ingen rader', () => {
    expect(expandSideAwardConfig([])).toEqual([]);
  });

  it('ctp med winnerCount 1 → én rad slot 1 uten gir-felter', () => {
    expect(
      expandSideAwardConfig([{ kind: 'ctp', holeNumber: 4, points: 2, winnerCount: 1 }]),
    ).toEqual([
      { kind: 'ctp', hole_number: 4, points: 2, slot: 1, gir_max_per_team: null },
    ]);
  });

  it('ctp med winnerCount 3 → tre rader slot 1..3 med samme points (desimal bevart)', () => {
    expect(
      expandSideAwardConfig([{ kind: 'ctp', holeNumber: 4, points: 1.5, winnerCount: 3 }]),
    ).toEqual([
      { kind: 'ctp', hole_number: 4, points: 1.5, slot: 1, gir_max_per_team: null },
      { kind: 'ctp', hole_number: 4, points: 1.5, slot: 2, gir_max_per_team: null },
      { kind: 'ctp', hole_number: 4, points: 1.5, slot: 3, gir_max_per_team: null },
    ]);
  });

  it('gir → ÉN rad slot 1 med gir_max_per_team, uansett maks', () => {
    expect(
      expandSideAwardConfig([{ kind: 'gir', holeNumber: 7, points: 1.5, maxPerTeam: 3 }]),
    ).toEqual([
      { kind: 'gir', hole_number: 7, points: 1.5, slot: 1, gir_max_per_team: 3 },
    ]);
  });

  it('blandet config beholder rekkefølgen, slots per config-rad', () => {
    expect(
      expandSideAwardConfig([
        { kind: 'ld', holeNumber: 6, points: 3, winnerCount: 2 },
        { kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 2 },
      ]),
    ).toEqual([
      { kind: 'ld', hole_number: 6, points: 3, slot: 1, gir_max_per_team: null },
      { kind: 'ld', hole_number: 6, points: 3, slot: 2, gir_max_per_team: null },
      { kind: 'gir', hole_number: 3, points: 1.5, slot: 1, gir_max_per_team: 2 },
    ]);
  });
});

describe('groupSideAwardRows (#1489)', () => {
  it('tom → tom', () => {
    expect(groupSideAwardRows([])).toEqual([]);
  });

  it('én ctp-rad slot 1 → config-rad med winnerCount 1', () => {
    expect(
      groupSideAwardRows([{ kind: 'ctp', holeNumber: 4, points: 2, maxPerTeam: null }]),
    ).toEqual([{ kind: 'ctp', holeNumber: 4, points: 2, winnerCount: 1 }]);
  });

  it('tre ctp-slots samme hull+points → én config-rad med winnerCount 3', () => {
    expect(
      groupSideAwardRows([
        { kind: 'ctp', holeNumber: 4, points: 2, maxPerTeam: null },
        { kind: 'ctp', holeNumber: 4, points: 2, maxPerTeam: null },
        { kind: 'ctp', holeNumber: 4, points: 2, maxPerTeam: null },
      ]),
    ).toEqual([{ kind: 'ctp', holeNumber: 4, points: 2, winnerCount: 3 }]);
  });

  it('gir-rad → config-rad med maxPerTeam', () => {
    expect(
      groupSideAwardRows([{ kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 3 }]),
    ).toEqual([{ kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 3 }]);
  });

  it('samme kind+hull med ULIK points (umulig via appen) → én gruppe per (kind, hull, points), ingen krasj', () => {
    expect(
      groupSideAwardRows([
        { kind: 'ctp', holeNumber: 4, points: 2, maxPerTeam: null },
        { kind: 'ctp', holeNumber: 4, points: 3, maxPerTeam: null },
        { kind: 'ctp', holeNumber: 4, points: 2, maxPerTeam: null },
      ]),
    ).toEqual([
      { kind: 'ctp', holeNumber: 4, points: 2, winnerCount: 2 },
      { kind: 'ctp', holeNumber: 4, points: 3, winnerCount: 1 },
    ]);
  });

  it('blandet input grupperes i første-forekomst-rekkefølge (snapshot leverer sortert)', () => {
    expect(
      groupSideAwardRows([
        { kind: 'ctp', holeNumber: 4, points: 2, maxPerTeam: null },
        { kind: 'ctp', holeNumber: 11, points: 2, maxPerTeam: null },
        { kind: 'ctp', holeNumber: 11, points: 2, maxPerTeam: null },
        { kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 2 },
        { kind: 'ld', holeNumber: 6, points: 3, maxPerTeam: null },
      ]),
    ).toEqual([
      { kind: 'ctp', holeNumber: 4, points: 2, winnerCount: 1 },
      { kind: 'ctp', holeNumber: 11, points: 2, winnerCount: 2 },
      { kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 2 },
      { kind: 'ld', holeNumber: 6, points: 3, winnerCount: 1 },
    ]);
  });

  it('gir-rad med null maxPerTeam (umulig via appen) → faller tilbake til maks 1, ingen krasj', () => {
    expect(
      groupSideAwardRows([{ kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: null }]),
    ).toEqual([{ kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 1 }]);
  });
});
