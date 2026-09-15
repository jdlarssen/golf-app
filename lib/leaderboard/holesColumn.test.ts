import { describe, it, expect } from 'vitest';
import { showHolesColumn } from './holesColumn';

describe('showHolesColumn', () => {
  it.each([
    // [label, status, counts, expected]
    ['live round, everyone on 18 so far', 'active', [18, 18, 18], true],
    ['live round, nobody has teed off', 'active', [0, 0], true],
    ['live round, no rows at all', 'active', [], true],
    ['scheduled round', 'scheduled', [0, 0, 0], true],
    ['draft round', 'draft', [18, 18], true],
    ['finished, everyone played 18', 'finished', [18, 18, 18], false],
    ['finished, single player on 18', 'finished', [18], false],
    ['finished, everyone played 9', 'finished', [9, 9, 9], false],
    ['finished, one gave up after 12', 'finished', [18, 12], true],
    ['finished, varying by one hole', 'finished', [18, 18, 17], true],
    ['finished, nobody scored a hole', 'finished', [0, 0], true],
    ['finished, one player never started', 'finished', [18, 18, 0], true],
    ['finished, no rows at all', 'finished', [], false],
  ] as const)('%s', (_label, status, counts, expected) => {
    expect(showHolesColumn(status, counts)).toBe(expected);
  });
});
