import { describe, it, expect } from 'vitest';
import { byEndedAtDesc } from './finishedOrder';

// Prod-fixtur fra #569: fysisk Postgres-rekkefølge observert på hjem-siden
// 12. juni — eldste runder først, nyeste nederst.
const physicalOrder = [
  { name: 'Fullsjuksøndag', ended_at: '2026-05-24T16:12:00+00:00' },
  { name: 'SICKlestad', ended_at: '2026-05-14T18:03:00+00:00' },
  { name: 'Runde 7. juni', ended_at: '2026-06-07T15:30:00+00:00' },
  { name: 'Runde 10. juni', ended_at: '2026-06-10T17:45:00+00:00' },
  { name: 'Runde 11. juni', ended_at: '2026-06-11T16:20:00+00:00' },
  { name: 'Runde 12. juni', ended_at: '2026-06-12T14:55:00+00:00' },
];

describe('byEndedAtDesc', () => {
  it('sorterer prod-fixturen fra #569 nyeste først', () => {
    const sorted = [...physicalOrder].sort(byEndedAtDesc);
    expect(sorted.map((g) => g.name)).toEqual([
      'Runde 12. juni',
      'Runde 11. juni',
      'Runde 10. juni',
      'Runde 7. juni',
      'Fullsjuksøndag',
      'SICKlestad',
    ]);
  });

  it('sorterer null ended_at sist', () => {
    const games = [
      { name: 'uten sluttid', ended_at: null },
      { name: 'nyest', ended_at: '2026-06-12T14:55:00+00:00' },
      { name: 'eldst', ended_at: '2026-05-14T18:03:00+00:00' },
    ];
    const sorted = [...games].sort(byEndedAtDesc);
    expect(sorted.map((g) => g.name)).toEqual(['nyest', 'eldst', 'uten sluttid']);
  });

  it('er stabil-vennlig: like tidsstempler gir 0', () => {
    const a = { ended_at: '2026-06-12T14:55:00+00:00' };
    expect(byEndedAtDesc(a, { ...a })).toBe(0);
    expect(byEndedAtDesc({ ended_at: null }, { ended_at: null })).toBe(0);
  });
});
