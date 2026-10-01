import { describe, it, expect } from 'vitest';
import { roundPlayerLocks, type RoundFlight } from './roundLocks';

const flight = (
  status: string,
  players: Array<[userId: string, withdrawnAt: string | null]>,
): RoundFlight => ({
  status,
  players: players.map(([userId, withdrawnAt]) => ({ userId, withdrawnAt })),
});

describe('roundPlayerLocks (#2214)', () => {
  it.each([
    ['finished, not withdrawn → delivered', flight('finished', [['A', null]]), ['A'], []],
    ['active, not withdrawn → in progress', flight('active', [['A', null]]), [], ['A']],
    ['scheduled, not withdrawn → in progress', flight('scheduled', [['A', null]]), [], ['A']],
    ['withdrawn from a finished flight → neither', flight('finished', [['A', '2026-06-15T19:00:00Z']]), [], []],
    ['withdrawn from an active flight → neither', flight('active', [['A', '2026-06-15T19:00:00Z']]), [], []],
    ['draft flight → neither', flight('draft', [['A', null]]), [], []],
  ])('%s', (_label, f, delivered, inProgress) => {
    const locks = roundPlayerLocks([f]);
    expect({ delivered: [...locks.delivered], inProgress: [...locks.inProgress] }).toEqual({
      delivered,
      inProgress,
    });
  });

  it('an empty round gives two empty sets', () => {
    const locks = roundPlayerLocks([]);
    expect({ delivered: locks.delivered.size, inProgress: locks.inProgress.size }).toEqual({
      delivered: 0,
      inProgress: 0,
    });
  });

  it('collects every player across several flights', () => {
    const locks = roundPlayerLocks([
      flight('finished', [['A', null], ['B', null]]),
      flight('active', [['C', null], ['D', '2026-06-15T19:00:00Z']]),
    ]);
    expect({
      delivered: [...locks.delivered].sort(),
      inProgress: [...locks.inProgress].sort(),
    }).toEqual({ delivered: ['A', 'B'], inProgress: ['C'] });
  });
});
