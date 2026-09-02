import { describe, it, expect } from 'vitest';
import {
  planCupRoleChange,
  resolveCupLineupRole,
  canSeeTeamLineup,
  teamRoster,
  hasPersistentCupRole,
  type CupParticipantRole,
} from './captainRoles';

const p = (
  userId: string,
  teamNumber: 1 | 2 | null = null,
  isCaptain = false,
): CupParticipantRole => ({ userId, teamNumber, isCaptain });

describe('planCupRoleChange', () => {
  it('assigns a team to an unassigned participant', () => {
    const out = planCupRoleChange({
      participants: [p('a'), p('b')],
      userId: 'a',
      teamNumber: 1,
      isCaptain: false,
    });
    expect(out).toEqual({
      ok: true,
      row: { userId: 'a', teamNumber: 1, isCaptain: false },
    });
  });

  it('rejects a user who is not on the participant list', () => {
    const out = planCupRoleChange({
      participants: [p('a')],
      userId: 'ghost',
      teamNumber: 1,
      isCaptain: false,
    });
    expect(out).toEqual({ ok: false, error: 'not_participant' });
  });

  it('rejects a captain without a team', () => {
    const out = planCupRoleChange({
      participants: [p('a')],
      userId: 'a',
      teamNumber: null,
      isCaptain: true,
    });
    expect(out).toEqual({ ok: false, error: 'captain_needs_team' });
  });

  it('rejects a second captain on the same team', () => {
    const out = planCupRoleChange({
      participants: [p('a', 1, true), p('b', 1)],
      userId: 'b',
      teamNumber: 1,
      isCaptain: true,
    });
    expect(out).toEqual({ ok: false, error: 'team_taken' });
  });

  it('lets the sitting captain re-save their own row', () => {
    const out = planCupRoleChange({
      participants: [p('a', 1, true)],
      userId: 'a',
      teamNumber: 1,
      isCaptain: true,
    });
    expect(out).toEqual({
      ok: true,
      row: { userId: 'a', teamNumber: 1, isCaptain: true },
    });
  });

  it('lets a captain move to the other team when that seat is free', () => {
    const out = planCupRoleChange({
      participants: [p('a', 1, true), p('b', 2)],
      userId: 'a',
      teamNumber: 2,
      isCaptain: true,
    });
    expect(out).toEqual({
      ok: true,
      row: { userId: 'a', teamNumber: 2, isCaptain: true },
    });
  });

  it('clears the captain flag when the team is cleared', () => {
    const out = planCupRoleChange({
      participants: [p('a', 1, true)],
      userId: 'a',
      teamNumber: null,
      isCaptain: false,
    });
    expect(out).toEqual({
      ok: true,
      row: { userId: 'a', teamNumber: null, isCaptain: false },
    });
  });

  it.each([0, 3, -1, 1.5])('rejects team number %s', (team) => {
    const out = planCupRoleChange({
      participants: [p('a')],
      userId: 'a',
      teamNumber: team as unknown as 1 | 2,
      isCaptain: false,
    });
    expect(out).toEqual({ ok: false, error: 'invalid_team' });
  });
});

describe('resolveCupLineupRole', () => {
  const participants = [p('cap1', 1, true), p('cap2', 2, true), p('pl', 1)];

  it('reports the organizer regardless of participation', () => {
    expect(
      resolveCupLineupRole({
        isOrganizer: true,
        participants,
        userId: 'someone-else',
      }),
    ).toEqual({ kind: 'organizer' });
  });

  it('prefers organizer over captain when the organizer also captains', () => {
    expect(
      resolveCupLineupRole({ isOrganizer: true, participants, userId: 'cap1' }),
    ).toEqual({ kind: 'organizer' });
  });

  it('reports a captain with their team', () => {
    expect(
      resolveCupLineupRole({ isOrganizer: false, participants, userId: 'cap2' }),
    ).toEqual({ kind: 'captain', teamNumber: 2 });
  });

  it('reports none for a plain participant', () => {
    expect(
      resolveCupLineupRole({ isOrganizer: false, participants, userId: 'pl' }),
    ).toEqual({ kind: 'none' });
  });

  it('reports none for a signed-out visitor', () => {
    expect(
      resolveCupLineupRole({ isOrganizer: false, participants, userId: null }),
    ).toEqual({ kind: 'none' });
  });

  it('ignores a captain flag on a row without a team', () => {
    expect(
      resolveCupLineupRole({
        isOrganizer: false,
        participants: [{ userId: 'x', teamNumber: null, isCaptain: true }],
        userId: 'x',
      }),
    ).toEqual({ kind: 'none' });
  });
});

describe('canSeeTeamLineup', () => {
  const organizer = { kind: 'organizer' } as const;
  const cap1 = { kind: 'captain', teamNumber: 1 } as const;
  const cap2 = { kind: 'captain', teamNumber: 2 } as const;
  const none = { kind: 'none' } as const;

  it('lets the organizer read both teams before reveal', () => {
    expect(canSeeTeamLineup({ role: organizer, team: 1, revealed: false })).toBe(
      true,
    );
    expect(canSeeTeamLineup({ role: organizer, team: 2, revealed: false })).toBe(
      true,
    );
  });

  it('lets a captain read only their own team before reveal', () => {
    expect(canSeeTeamLineup({ role: cap1, team: 1, revealed: false })).toBe(true);
    expect(canSeeTeamLineup({ role: cap1, team: 2, revealed: false })).toBe(
      false,
    );
    expect(canSeeTeamLineup({ role: cap2, team: 1, revealed: false })).toBe(
      false,
    );
  });

  it('hides both teams from everyone else before reveal', () => {
    expect(canSeeTeamLineup({ role: none, team: 1, revealed: false })).toBe(
      false,
    );
    expect(canSeeTeamLineup({ role: none, team: 2, revealed: false })).toBe(
      false,
    );
  });

  it('opens both teams to everyone once revealed', () => {
    for (const role of [organizer, cap1, cap2, none]) {
      for (const team of [1, 2] as const) {
        expect(canSeeTeamLineup({ role, team, revealed: true })).toBe(true);
      }
    }
  });
});

describe('teamRoster', () => {
  it('returns the team members in list order', () => {
    const list = [p('a', 1), p('b', 2), p('c', 1, true), p('d')];
    expect(teamRoster(list, 1).map((r) => r.userId)).toEqual(['a', 'c']);
    expect(teamRoster(list, 2).map((r) => r.userId)).toEqual(['b']);
  });
});

describe('hasPersistentCupRole', () => {
  it('is true for a team assignment', () => {
    expect(hasPersistentCupRole(p('a', 2))).toBe(true);
  });

  it('is true for a captain', () => {
    expect(hasPersistentCupRole(p('a', 1, true))).toBe(true);
  });

  it('is false for an untouched participant row', () => {
    expect(hasPersistentCupRole(p('a'))).toBe(false);
  });

  it('is false for a missing row', () => {
    expect(hasPersistentCupRole(undefined)).toBe(false);
  });
});
