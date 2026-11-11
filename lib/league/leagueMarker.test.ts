import { describe, expect, it } from 'vitest';
import {
  activeFlightmates,
  enteredAllBy,
  fixedMarker,
  markerCandidates,
  markerRefusal,
  markerRequired,
  mayApproveAsMarker,
  orderMarkerOptions,
  unchangedSinceMarker,
  withdrawLockedByDelivery,
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

// #2712 (owner 31.10): one attempt per round in a simulator league, so a
// delivered card can no longer be withdrawn from.
describe('withdrawLockedByDelivery', () => {
  it.each([
    { simulatorFlight: true, submittedAt: '2026-10-31T11:22:31Z', locked: true },
    { simulatorFlight: true, submittedAt: null, locked: false },
    { simulatorFlight: false, submittedAt: '2026-10-31T11:22:31Z', locked: false },
    { simulatorFlight: false, submittedAt: null, locked: false },
  ])('simulator $simulatorFlight, levert $submittedAt → $locked', ({ simulatorFlight, submittedAt, locked }) => {
    expect(withdrawLockedByDelivery({ simulatorFlight, submittedAt })).toBe(locked);
  });
});

// #2814: the one who keeps the flight's cards is the flightmates' marker. The
// flightmate looks the card over and delivers it; unchanged, it is approved.
describe('enteredAllBy / unchangedSinceMarker', () => {
  const row = (entered_by: string | null) => ({ entered_by });

  it('is true when every row is the marker\'s', () => {
    expect(unchangedSinceMarker([row('a'), row('a'), row('a')], 'a')).toBe(true);
  });

  it('is false when one row is the player\'s own, even with the same strokes', () => {
    expect(unchangedSinceMarker([row('a'), row('b'), row('a')], 'a')).toBe(false);
  });

  it('is false without rows', () => {
    expect(unchangedSinceMarker([], 'a')).toBe(false);
  });

  it('is false for a row nobody is known to have keyed', () => {
    expect(unchangedSinceMarker([row('a'), row(null)], 'a')).toBe(false);
  });

  it('is the same predicate as «kept by» in the flight delivery', () => {
    expect(enteredAllBy([row('a')], 'a')).toBe(true);
    expect(enteredAllBy([row('b')], 'a')).toBe(false);
  });
});

describe('markerCandidates when the deliverer hands the flight over (#2814)', () => {
  it('keeps the flightmate when only the deliverer\'s own card is delivered', () => {
    expect(markerCandidates(['a', 'b', 'c'], ['a'], 'a')).toEqual(['b', 'c']);
  });
});

describe('activeFlightmates', () => {
  it('is the other active players in the flight, never a withdrawn one', () => {
    expect(
      activeFlightmates(
        [
          { user_id: 'a', withdrawn_at: null },
          { user_id: 'b', withdrawn_at: null },
          { user_id: 'c', withdrawn_at: '2026-11-10T10:00:00Z' },
        ],
        'a',
      ),
    ).toEqual(['b']);
  });

  it('is empty for someone playing alone', () => {
    expect(activeFlightmates([{ user_id: 'a', withdrawn_at: null }], 'a')).toEqual([]);
  });
});

describe('orderMarkerOptions', () => {
  const o = (userId: string, name: string | null) => ({ userId, name });

  it('puts the flightmates first, then the rest of the league, each by name', () => {
    const options = [o('x', 'Øyvind'), o('b', 'Pål'), o('y', 'Anne'), o('c', 'Bjørn')];
    expect(orderMarkerOptions(options, ['b', 'c']).map((m) => m.userId)).toEqual(['c', 'b', 'y', 'x']);
  });

  it('sorts a withdrawn player with the rest of the league', () => {
    const options = [o('b', 'Pål'), o('w', 'Anne')];
    const mates = activeFlightmates(
      [
        { user_id: 'a', withdrawn_at: null },
        { user_id: 'b', withdrawn_at: null },
        { user_id: 'w', withdrawn_at: '2026-11-10T10:00:00Z' },
      ],
      'a',
    );
    expect(orderMarkerOptions(options, mates).map((m) => m.userId)).toEqual(['b', 'w']);
  });

  it('is the league by name when nobody else is in the flight', () => {
    expect(orderMarkerOptions([o('b', 'Pål'), o('c', null), o('d', 'Anne')], []).map((m) => m.userId)).toEqual([
      'c',
      'd',
      'b',
    ]);
  });

  it('is empty without options', () => {
    expect(orderMarkerOptions([], ['b'])).toEqual([]);
  });
});

// #2814: whether the card's marker is fixed, and why. The owner 11.11: a card
// its marker sent back goes back to the same marker; «Ja, legg til feltet»:
// handed over is a fact (`handed_over_at`), not a guess from the flight.
describe('fixedMarker', () => {
  const card = (over: Partial<{ marker_user_id: string | null; submitted_at: string | null; rejection_reason: string | null; handed_over_at: string | null }>) => ({
    user_id: 'b',
    marker_user_id: 'a',
    submitted_at: null,
    rejection_reason: null,
    handed_over_at: null,
    ...over,
  });

  it('is handed over when the server stamped the handover', () => {
    expect(fixedMarker(card({ handed_over_at: '2026-11-11T10:00:00Z' }))).toEqual({ reason: 'handedOver', markerUserId: 'a' });
  });

  it('is returned when the marker sent the card back, also outside the flight', () => {
    expect(fixedMarker(card({ marker_user_id: 'kari', rejection_reason: 'hull 7' }))).toEqual({
      reason: 'returned',
      markerUserId: 'kari',
    });
  });

  it('is assigned for a card with a marker and neither: reopened, or a delivery that failed', () => {
    expect(fixedMarker(card({}))).toEqual({ reason: 'assigned', markerUserId: 'a' });
  });

  it('is null without a marker', () => {
    expect(fixedMarker(card({ marker_user_id: null }))).toBeNull();
  });

  it('is null once the card is delivered', () => {
    expect(fixedMarker(card({ submitted_at: '2026-11-11T10:00:00Z', handed_over_at: '2026-11-11T09:00:00Z' }))).toBeNull();
  });

  it('is null when the marker is the card\'s owner', () => {
    expect(fixedMarker(card({ marker_user_id: 'b' }))).toBeNull();
  });
});

