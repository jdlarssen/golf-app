import { describe, expect, it } from 'vitest';
import {
  answeredYes,
  freeSlotCount,
  hasTeamPage,
  memberState,
  menuActions,
  orderedMembers,
} from './teamPageModel';

// #2840 del 5: the web team page's rules (Type A), the same as the app's.
describe('teamPageModel', () => {
  it.each([
    ['approved', 'approved'],
    ['pending', 'pending'],
    ['rejected', 'declined'],
    ['withdrawn', 'declined'],
  ] as const)('%s reads as %s', (status, state) => {
    expect(memberState(status)).toBe(state);
  });

  it('orders yes, waiting, no, and keeps the server order within each', () => {
    const rows = [
      { id: 'a', status: 'rejected' as const },
      { id: 'b', status: 'pending' as const },
      { id: 'c', status: 'approved' as const },
      { id: 'd', status: 'pending' as const },
    ];
    expect(orderedMembers(rows).map((r) => r.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it.each([
    [4, 3, 0],
    [4, 2, 1],
    [4, 0, 3],
    [2, 2, 0],
    [null, 0, 0],
  ])('team of %s with %s rows has %s free seats', (size, rows, free) => {
    expect(freeSlotCount(size, rows)).toBe(free);
  });

  it('counts the captain as a yes and leaves out those who said no', () => {
    expect(
      answeredYes({ status: 'approved' }, [
        { status: 'approved' },
        { status: 'pending' },
        { status: 'rejected' },
      ]),
    ).toEqual({ yes: 2, of: 3 });
  });

  it.each([
    [{ status: 'pending', isGuest: false }, ['resend', 'remove']],
    [{ status: 'approved', isGuest: false }, ['transfer', 'remove']],
    [{ status: 'approved', isGuest: true }, ['remove']],
    [{ status: 'rejected', isGuest: false }, []],
    [{ status: 'withdrawn', isGuest: false }, []],
  ] as const)('menu for %j is %j', (member, actions) => {
    expect(menuActions(member)).toEqual(actions);
  });

  // The way to the team page after signing up (#2840 del 5): the captain, and a
  // teammate who has not said no. The app's «Se laget» uses the same rule.
  it.each([
    [{ status: 'approved', is_team_captain: true, team_request_id: null }, true],
    [{ status: 'pending', is_team_captain: true, team_request_id: null }, true],
    [{ status: 'approved', is_team_captain: false, team_request_id: 'cap' }, true],
    [{ status: 'pending', is_team_captain: false, team_request_id: 'cap' }, true],
    [{ status: 'rejected', is_team_captain: false, team_request_id: 'cap' }, false],
    [{ status: 'withdrawn', is_team_captain: true, team_request_id: null }, false],
    [{ status: 'approved', is_team_captain: false, team_request_id: null }, false],
  ] as const)('hasTeamPage(%o) is %s', (row, expected) => {
    expect(hasTeamPage(row)).toBe(expected);
  });

  it('has no team page without a request row', () => {
    expect(hasTeamPage(null)).toBe(false);
  });
});
