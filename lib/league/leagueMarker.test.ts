import { describe, expect, it } from 'vitest';
import {
  markerCandidates,
  markerRefusal,
  markerRequired,
  mayApproveAsMarker,
} from './leagueMarker';

describe('markerRequired', () => {
  it('asks for a marker in a simulator league only', () => {
    expect(markerRequired(true)).toBe(true);
    expect(markerRequired(false)).toBe(false);
  });
});

describe('markerCandidates', () => {
  it('is every member except the card owners and the deliverer', () => {
    expect(markerCandidates(['a', 'b', 'c', 'd'], ['a', 'b'], 'a')).toEqual(['c', 'd']);
  });

  it('leaves out a deliverer who keeps score for someone else', () => {
    expect(markerCandidates(['a', 'b', 'c'], ['b'], 'a')).toEqual(['c']);
  });

  it('keeps a flightmate whose card is not in this delivery', () => {
    expect(markerCandidates(['a', 'b', 'c'], ['a'], 'a')).toEqual(['b', 'c']);
  });

  it('is empty in a league of one', () => {
    expect(markerCandidates(['a'], ['a'], 'a')).toEqual([]);
  });

  it('is empty without members', () => {
    expect(markerCandidates([], ['a'], 'a')).toEqual([]);
  });

  it('lists a member once even when the list repeats them', () => {
    expect(markerCandidates(['a', 'c', 'c'], ['a', 'a'], 'a')).toEqual(['c']);
  });
});

describe('markerRefusal', () => {
  const members = ['a', 'b', 'c'];

  it('accepts a member who is not on the cards', () => {
    expect(markerRefusal({ markerUserId: 'c', memberIds: members, cardOwnerIds: ['a'], delivererId: 'a' })).toBeNull();
  });

  it('refuses no marker', () => {
    expect(markerRefusal({ markerUserId: null, memberIds: members, cardOwnerIds: ['a'], delivererId: 'a' })).toBe(
      'marker_required',
    );
    expect(markerRefusal({ markerUserId: '', memberIds: members, cardOwnerIds: ['a'], delivererId: 'a' })).toBe(
      'marker_required',
    );
  });

  it('refuses the player themself, and an owner of a card in the delivery', () => {
    expect(markerRefusal({ markerUserId: 'a', memberIds: members, cardOwnerIds: ['a'], delivererId: 'a' })).toBe(
      'marker_is_self',
    );
    expect(
      markerRefusal({ markerUserId: 'b', memberIds: members, cardOwnerIds: ['a', 'b'], delivererId: 'a' }),
    ).toBe('marker_is_self');
  });

  it('refuses the deliverer on a card they keyed for someone else', () => {
    expect(markerRefusal({ markerUserId: 'a', memberIds: members, cardOwnerIds: ['b'], delivererId: 'a' })).toBe(
      'marker_is_self',
    );
  });

  it('refuses someone outside the league', () => {
    expect(markerRefusal({ markerUserId: 'z', memberIds: members, cardOwnerIds: ['a'], delivererId: 'a' })).toBe(
      'marker_not_member',
    );
  });
});

describe('mayApproveAsMarker', () => {
  const card = { markerUserId: 'm', ownerId: 'a', submittedBy: 'a', leagueCreatorId: 'org' };

  it('lets the named marker approve', () => {
    expect(mayApproveAsMarker({ ...card, approverId: 'm', approverIsAdmin: false })).toBe('marker');
  });

  it('lets the league organiser and a global admin approve in the marker’s stead', () => {
    expect(mayApproveAsMarker({ ...card, approverId: 'org', approverIsAdmin: false })).toBe('organizer');
    expect(mayApproveAsMarker({ ...card, approverId: 'adm', approverIsAdmin: true })).toBe('organizer');
  });

  it('never lets the owner or the one who delivered approve', () => {
    expect(mayApproveAsMarker({ ...card, approverId: 'a', approverIsAdmin: false })).toBeNull();
    expect(mayApproveAsMarker({ ...card, submittedBy: 'b', approverId: 'b', approverIsAdmin: false })).toBeNull();
    // Also not when they run the league.
    expect(
      mayApproveAsMarker({ ...card, leagueCreatorId: 'a', approverId: 'a', approverIsAdmin: false }),
    ).toBeNull();
  });

  it('refuses a flightmate or another member who is not the marker', () => {
    expect(mayApproveAsMarker({ ...card, approverId: 'x', approverIsAdmin: false })).toBeNull();
  });

  it('gives the organiser, not the marker role, on a card without a marker', () => {
    expect(mayApproveAsMarker({ ...card, markerUserId: null, approverId: 'm', approverIsAdmin: false })).toBeNull();
    expect(
      mayApproveAsMarker({ ...card, markerUserId: null, approverId: 'org', approverIsAdmin: false }),
    ).toBe('organizer');
  });
});
