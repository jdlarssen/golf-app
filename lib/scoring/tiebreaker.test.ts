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
    // Same total (66), same back 9 sum (30), different back 6 sum (18 vs 19).
    // Holes 1-9 identical; holes 10-12 absorb the difference so back-9 stays equal
    // while back-6 differs.
    const teams = [
      // total 66, back 9 = 30, back 6 = 18
      { id: 1, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4,  3, 3, 3, 3, 3, 3] },
      // total 66, back 9 = 30, back 6 = 19
      { id: 2, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  3, 4, 4,  3, 3, 3, 4, 3, 3] },
    ];
    const result = rankTeams(teams);
    expect(result.map((t) => t.id)).toEqual([1, 2]);  // team 1 has lower back 6
  });

  it('cascades to back 3 when back 9 and back 6 tie', () => {
    // Same total (72), same back 9 (36), same back 6 (24), different back 3 (9 vs 15).
    // Holes 1-12 identical; holes 13-15 vs 16-18 split differently to keep back-6 equal.
    const teams = [
      // back 6 holes = [5,5,5,3,3,3] → back-3 = 9
      { id: 1, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4,  5, 5, 5, 3, 3, 3] },
      // back 6 holes = [3,3,3,5,5,5] → back-3 = 15
      { id: 2, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4,  3, 3, 3, 5, 5, 5] },
    ];
    const result = rankTeams(teams);
    expect(result.map((t) => t.id)).toEqual([1, 2]);  // team 1 has lower back 3
  });

  it('cascades to hole 18 when back 9 / 6 / 3 tie', () => {
    // Same total (73), back 9 (37), back 6 (25), back 3 (13); different hole 18 (3 vs 4).
    // Holes 1-15 identical; holes 16-18 sum to 13 both but with different hole-18 values.
    const teams = [
      // holes 16-18 = [5,5,3] → hole 18 = 3
      { id: 1, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4,  4, 4, 4,  5, 5, 3] },
      // holes 16-18 = [4,5,4] → hole 18 = 4
      { id: 2, holes: [4, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4,  4, 4, 4,  4, 5, 4] },
    ];
    const result = rankTeams(teams);
    expect(result.map((t) => t.id)).toEqual([1, 2]);  // team 1 has lower hole 18
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
