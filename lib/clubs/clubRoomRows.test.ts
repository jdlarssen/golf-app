import { describe, expect, it } from 'vitest';
import { nextRoundByClub } from './clubRoomRows';

// «Neste runde» on a club row in the Klubbhus room (#2493): the first
// scheduled club round with a tee-off from now on, open or closed signup
// alike (15c). A round without a tee-off, or one whose tee-off has passed, is
// not the next round.
const NOW = new Date('2026-10-05T12:00:00Z');
const row = (group_id: string | null, scheduled_tee_off_at: string | null) => ({ group_id, scheduled_tee_off_at });

describe('nextRoundByClub', () => {
  it.each([
    ['no rows', [], {}],
    ['one round with a time', [row('c1', '2026-10-10T07:00:00Z')], { c1: '2026-10-10T07:00:00Z' }],
    [
      'the earliest per club, whatever the row order',
      [row('c1', '2026-10-20T07:00:00Z'), row('c2', '2026-10-12T07:00:00Z'), row('c1', '2026-10-10T07:00:00Z')],
      { c1: '2026-10-10T07:00:00Z', c2: '2026-10-12T07:00:00Z' },
    ],
    ['a round without a time is no next round', [row('c1', null)], {}],
    ['a passed tee-off is no next round', [row('c1', '2026-10-01T07:00:00Z'), row('c1', '2026-10-15T07:00:00Z')], { c1: '2026-10-15T07:00:00Z' }],
    ['a tee-off right now counts', [row('c1', '2026-10-05T12:00:00Z')], { c1: '2026-10-05T12:00:00Z' }],
    ['a row without a club is skipped', [row(null, '2026-10-10T07:00:00Z')], {}],
  ] as const)('%s', (_label, rows, expected) => {
    expect(Object.fromEntries(nextRoundByClub(rows, NOW))).toEqual(expected);
  });
});
