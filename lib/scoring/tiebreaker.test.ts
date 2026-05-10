import { describe, it, expect } from 'vitest';
import { rankTeams } from './tiebreaker';

describe('rankTeams', () => {
  it('orders by total ascending', () => {
    const teams = [
      { id: 1, holes: Array.from({ length: 18 }, () => 4) },  // 72
      { id: 2, holes: Array.from({ length: 18 }, () => 3) },  // 54
    ];
    expect(rankTeams(teams).map((t) => t.id)).toEqual([2, 1]);
  });

  it('tiebreaker by back 9', () => {
    const front = Array.from({ length: 9 }, () => 4);
    const teams = [
      { id: 1, holes: [...front, ...Array.from({ length: 9 }, () => 4)] },  // 72 total, back 9 = 36
      { id: 2, holes: [...front.map(() => 5), ...Array.from({ length: 9 }, () => 3)] },  // 72 total, back 9 = 27
    ];
    expect(rankTeams(teams).map((t) => t.id)).toEqual([2, 1]);
  });

  it('cascades to back 6 when back 9 ties', () => {
    // Same total, same back 9 sum, different back 6 sum
    const teams = [
      { id: 1, holes: [...Array.from({ length: 12 }, () => 4), 5, 5, 4, 3, 3, 3] },  // total 71, back 9 = 35, back 6 = 21
      { id: 2, holes: [...Array.from({ length: 12 }, () => 4), 3, 3, 5, 5, 5, 3] },  // total 71, back 9 = 35, back 6 = 23
    ];
    const result = rankTeams(teams);
    expect(result.map((t) => t.id)).toEqual([1, 2]);  // team 1 has lower back 6
  });

  it('marks teams as tied when all tiebreakers match', () => {
    const holes = [
      ...Array.from({ length: 9 }, () => 4),
      ...Array.from({ length: 9 }, () => 4),
    ];
    const teams = [
      { id: 1, holes: [...holes] },
      { id: 2, holes: [...holes] },
    ];
    const result = rankTeams(teams);
    expect(result[0].tiedWith).toContain(2);
    expect(result[1].tiedWith).toContain(1);
  });

  it('sets rank starting at 1', () => {
    const teams = [
      { id: 1, holes: Array.from({ length: 18 }, () => 4) },
      { id: 2, holes: Array.from({ length: 18 }, () => 3) },
    ];
    const result = rankTeams(teams);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });
});
