import { describe, it, expect } from 'vitest';
import { leagueSelfServiceState } from './selfService';
import type { LeagueSelfServiceInput } from './selfService';

const base: LeagueSelfServiceInput = {
  groupId: 'club-1',
  status: 'draft',
  isClubMember: true,
  isParticipant: false,
  hasPlayed: false,
};

describe('leagueSelfServiceState', () => {
  it('frittstående liga (groupId null): never join, never leave', () => {
    expect(leagueSelfServiceState({ ...base, groupId: null })).toEqual({
      canJoin: false,
      canLeave: false,
    });
    expect(
      leagueSelfServiceState({ ...base, groupId: null, isParticipant: true }),
    ).toEqual({ canJoin: false, canLeave: false });
  });

  it('draft klubb-liga, member, not participant → canJoin', () => {
    expect(leagueSelfServiceState(base)).toEqual({ canJoin: true, canLeave: false });
  });

  it('draft klubb-liga, non-member, not participant → cannot join', () => {
    expect(
      leagueSelfServiceState({ ...base, isClubMember: false }),
    ).toEqual({ canJoin: false, canLeave: false });
  });

  it('draft klubb-liga, already participant → no join, can leave (not played)', () => {
    expect(
      leagueSelfServiceState({ ...base, isParticipant: true }),
    ).toEqual({ canJoin: false, canLeave: true });
  });

  it('active klubb-liga: no self-join even for a member', () => {
    expect(
      leagueSelfServiceState({ ...base, status: 'active' }),
    ).toEqual({ canJoin: false, canLeave: false });
  });

  it('active klubb-liga, participant who has not played → can leave', () => {
    expect(
      leagueSelfServiceState({ ...base, status: 'active', isParticipant: true }),
    ).toEqual({ canJoin: false, canLeave: true });
  });

  it('active klubb-liga, participant who has played → cannot leave', () => {
    expect(
      leagueSelfServiceState({
        ...base,
        status: 'active',
        isParticipant: true,
        hasPlayed: true,
      }),
    ).toEqual({ canJoin: false, canLeave: false });
  });

  it('finished klubb-liga: neither join nor leave', () => {
    expect(
      leagueSelfServiceState({ ...base, status: 'finished', isParticipant: true }),
    ).toEqual({ canJoin: false, canLeave: false });
    expect(
      leagueSelfServiceState({ ...base, status: 'finished' }),
    ).toEqual({ canJoin: false, canLeave: false });
  });
});
