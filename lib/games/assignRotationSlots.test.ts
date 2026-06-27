import { describe, it, expect } from 'vitest';
import { assignRotationSlots } from './assignRotationSlots';

describe('assignRotationSlots', () => {
  const identity = <T>(arr: T[]): T[] => arr.slice();
  const reverse = <T>(arr: T[]): T[] => arr.slice().reverse();

  it('emits one row per id with contiguous team_number = flight_number = 1..n', () => {
    const rows = assignRotationSlots(['a', 'b', 'c', 'd'], identity);
    expect(rows).toEqual([
      { user_id: 'a', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 2, flight_number: 2 },
      { user_id: 'c', team_number: 3, flight_number: 3 },
      { user_id: 'd', team_number: 4, flight_number: 4 },
    ]);
  });

  it('assigns slots in the shuffled order (injected shuffle is the source of order)', () => {
    const rows = assignRotationSlots(['a', 'b', 'c'], reverse);
    expect(rows).toEqual([
      { user_id: 'c', team_number: 1, flight_number: 1 },
      { user_id: 'b', team_number: 2, flight_number: 2 },
      { user_id: 'a', team_number: 3, flight_number: 3 },
    ]);
  });

  it('returns an empty array for an empty roster', () => {
    expect(assignRotationSlots([], identity)).toEqual([]);
  });

  it('covers every input id exactly once with the default (crypto) shuffle', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const rows = assignRotationSlots(ids);
    expect(rows.map((r) => r.user_id).sort()).toEqual([...ids].sort());
    const slots = rows.map((r) => r.team_number).sort((x, y) => x - y);
    expect(slots).toEqual([1, 2, 3, 4, 5]);
    expect(rows.every((r) => r.team_number === r.flight_number)).toBe(true);
  });
});
