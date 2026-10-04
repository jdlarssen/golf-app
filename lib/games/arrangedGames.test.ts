import { describe, expect, it } from 'vitest';
import {
  arrangedList,
  arrangedListHref,
  arrangedRoundHref,
  groupArrangedRounds,
  groupRosterByGame,
  onlyStandaloneGames,
  scheduledRowNote,
  sortedUpcomingGames,
  upcomingBlockIds,
  type ArrangedRosterRow,
} from './arrangedGames';
import type { StartBlock } from './startBlockReason';
import { arrangedGame as game, arrangedRosterRow as player } from './__fixtures__/arrangedGame';

// A fake PostgREST builder that records `is()` calls — the filter is pure
// query composition, so no Supabase mock is needed.
function fakeBuilder() {
  const calls: Array<[string, boolean | null]> = [];
  const builder = {
    calls,
    is(column: string, value: boolean | null) {
      calls.push([column, value]);
      return builder;
    },
  };
  return builder;
}

describe('onlyStandaloneGames', () => {
  it('drops cup matches and league flights, and hands the builder back', () => {
    const builder = fakeBuilder();
    expect(onlyStandaloneGames(builder)).toBe(builder);
    expect(builder.calls).toEqual([
      ['tournament_id', null],
      ['league_round_id', null],
    ]);
  });
});

const T = '2026-10-03T12:00:00Z';
const NO_ROSTER = new Map<string, ArrangedRosterRow[]>();

describe('groupArrangedRounds', () => {
  it('gives empty groups for no games', () => {
    expect(groupArrangedRounds([], NO_ROSTER)).toEqual({
      live: [],
      upcoming: [],
      drafts: { count: 0, onlyId: null },
      finished: { count: 0 },
    });
  });

  it.each([
    ['no draft', [], { count: 0, onlyId: null }],
    ['one draft', ['d1'], { count: 1, onlyId: 'd1' }],
    ['three drafts', ['d1', 'd2', 'd3'], { count: 3, onlyId: null }],
  ])('drafts: %s', (_label, ids, expected) => {
    const games = ids.map((id) => game({ id, status: 'draft' }));
    expect(groupArrangedRounds(games, NO_ROSTER).drafts).toEqual(expected);
  });

  it('counts the finished rounds', () => {
    const games = [
      game({ id: 'f1', status: 'finished' }),
      game({ id: 'f2', status: 'finished' }),
      game({ id: 'a1', status: 'active' }),
    ];
    expect(groupArrangedRounds(games, NO_ROSTER).finished).toEqual({ count: 2 });
  });

  it('sorts the live rounds newest start first, a missing start last', () => {
    const games = [
      game({ id: 'old', status: 'active', started_at: '2026-10-01T08:00:00Z' }),
      game({ id: 'none', status: 'active', started_at: null }),
      game({ id: 'new', status: 'active', started_at: '2026-10-03T08:00:00Z' }),
    ];
    expect(groupArrangedRounds(games, NO_ROSTER).live.map((r) => r.game.id)).toEqual([
      'new',
      'old',
      'none',
    ]);
  });

  it('counts deliveries with deliveryCounts: a withdrawn card is out of every count', () => {
    const games = [game({ id: 'a', status: 'active', started_at: T })];
    const roster = groupRosterByGame([
      player('a', { submitted_at: T }),
      player('a', { submitted_at: T }),
      player('a'),
      player('a', { submitted_at: T, withdrawn_at: T }),
    ]);
    expect(groupArrangedRounds(games, roster).live[0].counts).toEqual({
      total: 3,
      submitted: 2,
      notSubmitted: 1,
      pendingApproval: 0,
    });
  });

  it.each([
    ['with peer approval', true, 1],
    ['without peer approval', false, 0],
  ])('pending approval %s', (_label, requirePeerApproval, expected) => {
    const games = [
      game({ id: 'a', status: 'active', started_at: T, require_peer_approval: requirePeerApproval }),
    ];
    const roster = groupRosterByGame([
      player('a', { submitted_at: T }),
      player('a', { submitted_at: T, approved_at: T }),
    ]);
    expect(groupArrangedRounds(games, roster).live[0].counts.pendingApproval).toBe(expected);
  });

  it('gives a live round without roster rows zero counts', () => {
    const games = [game({ id: 'a', status: 'active', started_at: T })];
    expect(groupArrangedRounds(games, NO_ROSTER).live[0].counts).toEqual({
      total: 0,
      submitted: 0,
      notSubmitted: 0,
      pendingApproval: 0,
    });
  });

  it('sorts the upcoming rounds by tee-off, a missing time last, then by created_at', () => {
    const games = [
      game({ id: 'no-time-new', status: 'scheduled', created_at: '2026-09-20T10:00:00Z' }),
      game({ id: 'late', status: 'scheduled', scheduled_tee_off_at: '2026-10-18T09:00:00Z' }),
      game({ id: 'no-time-old', status: 'scheduled', created_at: '2026-09-02T10:00:00Z' }),
      game({
        id: 'early-b',
        status: 'scheduled',
        scheduled_tee_off_at: '2026-10-08T15:30:00Z',
        created_at: '2026-09-10T10:00:00Z',
      }),
      game({
        id: 'early-a',
        status: 'scheduled',
        scheduled_tee_off_at: '2026-10-08T15:30:00Z',
        created_at: '2026-09-05T10:00:00Z',
      }),
    ];
    const order = ['early-a', 'early-b', 'late', 'no-time-old', 'no-time-new'];
    expect(sortedUpcomingGames(games).map((g) => g.id)).toEqual(order);
    expect(groupArrangedRounds(games, NO_ROSTER).upcoming.map((r) => r.game.id)).toEqual(order);
  });

  it.each([
    ['open signup', { registration_mode: 'open' as const }, 'open'],
    ['manual approval', { registration_mode: 'manual_approval' as const }, 'open'],
    ['closed by the organiser', { registration_mode: 'open' as const, signups_closed_at: T }, 'closed'],
    ['invite only', { registration_mode: 'invite_only' as const }, null],
    ['invite only, closed', { registration_mode: 'invite_only' as const, signups_closed_at: T }, 'closed'],
    // A club round is open to its members on «invite only» too: the Terminliste
    // lists it on the signup window alone (#2276, `isSignupWindowOpen`).
    ['club round, invite only', { registration_mode: 'invite_only' as const, group_id: 'club-1' }, 'open'],
    ['club round, closed', { registration_mode: 'invite_only' as const, group_id: 'club-1', signups_closed_at: T }, 'closed'],
  ])('signup state: %s', (_label, over, expected) => {
    const games = [game({ id: 's', status: 'scheduled', scheduled_tee_off_at: T, ...over })];
    expect(groupArrangedRounds(games, NO_ROSTER).upcoming[0].signups).toBe(expected);
  });

  it('counts signed-up players who have not withdrawn', () => {
    const games = [game({ id: 's', status: 'scheduled', scheduled_tee_off_at: T })];
    const roster = groupRosterByGame([player('s'), player('s'), player('s', { withdrawn_at: T })]);
    expect(groupArrangedRounds(games, roster).upcoming[0].signedUp).toBe(2);
  });

  it('marks a missing tee-off and reads the start block for the note', () => {
    const games = [
      game({ id: 'no-time', status: 'scheduled' }),
      game({ id: 'blocked', status: 'scheduled', scheduled_tee_off_at: T }),
      game({ id: 'fine', status: 'scheduled', scheduled_tee_off_at: '2026-10-04T12:00:00Z' }),
    ];
    const startBlocks = new Map<string, StartBlock | null>([
      ['blocked', { reason: 'unassigned_flights' }],
      ['fine', null],
    ]);
    const upcoming = groupArrangedRounds(games, NO_ROSTER, { startBlocks }).upcoming;
    expect(upcoming.map((r) => [r.game.id, r.missingTeeOff, r.note])).toEqual([
      ['blocked', false, { kind: 'blocked', reason: 'unassigned_flights' }],
      ['fine', false, null],
      ['no-time', true, { kind: 'missingTeeOff' }],
    ]);
  });
});

describe('scheduledRowNote', () => {
  it.each<[string, boolean, StartBlock | null, ReturnType<typeof scheduledRowNote>]>([
    ['missing tee-off, no block', true, null, { kind: 'missingTeeOff' }],
    ['missing tee-off wins over a block', true, { reason: 'tee_missing' }, { kind: 'missingTeeOff' }],
    ['structural block', false, { reason: 'tee_missing_rating' }, { kind: 'blocked', reason: 'tee_missing_rating' }],
    ['structural block: pending players', false, { reason: 'pending_players', pendingUserIds: ['u1'] }, { kind: 'blocked', reason: 'pending_players' }],
    ['silent block', false, { reason: 'cup_finished' }, null],
    ['silent block: decided by withdrawal', false, { reason: 'decided_by_withdrawal' }, null],
    ['no block', false, null, null],
  ])('%s', (_label, missingTeeOff, block, expected) => {
    expect(scheduledRowNote({ missingTeeOff }, block)).toEqual(expected);
  });
});

describe('upcomingBlockIds', () => {
  const games = [
    game({ id: 'draft', status: 'draft', scheduled_tee_off_at: T }),
    game({ id: 'third', status: 'scheduled', scheduled_tee_off_at: '2026-10-20T09:00:00Z' }),
    game({ id: 'first', status: 'scheduled', scheduled_tee_off_at: '2026-10-08T09:00:00Z' }),
    game({ id: 'no-time', status: 'scheduled' }),
    game({ id: 'second', status: 'scheduled', scheduled_tee_off_at: '2026-10-10T09:00:00Z' }),
  ];

  it.each([
    ['every shown scheduled round with a time', undefined, ['first', 'second', 'third']],
    ['only the rows the limit shows', 2, ['first', 'second']],
  ])('%s', (_label, limit, expected) => {
    expect(upcomingBlockIds(games, limit)).toEqual(expected);
  });

  it('skips a round without a time inside the limit', () => {
    const noTimeFirst = [game({ id: 'only', status: 'scheduled' })];
    expect(upcomingBlockIds(noTimeFirst, 3)).toEqual([]);
  });
});

describe('arrangedList', () => {
  const games = [
    game({ id: 'd-old', status: 'draft', created_at: '2026-09-01T10:00:00Z' }),
    game({ id: 'f-none', status: 'finished', ended_at: null }),
    game({ id: 'd-new', status: 'draft', created_at: '2026-09-20T10:00:00Z' }),
    game({ id: 'f-old', status: 'finished', ended_at: '2026-09-01T18:00:00Z' }),
    game({ id: 'f-new', status: 'finished', ended_at: '2026-10-01T18:00:00Z' }),
    game({ id: 'a', status: 'active' }),
  ];

  it.each([
    ['drafts, newest first', 'drafts' as const, ['d-new', 'd-old']],
    ['finished, latest end first, a missing end last', 'finished' as const, ['f-new', 'f-old', 'f-none']],
  ])('%s', (_label, kind, expected) => {
    expect(arrangedList(games, kind).map((g) => g.id)).toEqual(expected);
  });
});

describe('arrangedRoundHref', () => {
  it.each([
    ['live', true, '/admin/games/g1'],
    ['upcoming', true, '/admin/games/g1'],
    ['draft', true, '/admin/games/g1/edit?step=5'],
    ['live', false, '/games/g1/spillere'],
    ['upcoming', false, '/games/g1'],
    ['draft', false, '/games/g1/rediger?step=5'],
  ] as const)('%s, admin=%s → %s', (kind, isAdmin, expected) => {
    expect(arrangedRoundHref(kind, 'g1', isAdmin)).toBe(expected);
  });
});

describe('arrangedListHref', () => {
  // The list follows where the count came from, not the role: an admin on
  // /klubbhuset counts their own games, so the list must be their own too.
  it.each([
    ['drafts', 'all', '/admin/games?status=draft'],
    ['finished', 'all', '/admin/games?status=finished'],
    ['drafts', 'own', '/klubbhuset?vis=utkast'],
    ['finished', 'own', '/klubbhuset?vis=ferdige'],
  ] as const)('%s, counted over %s games → %s', (kind, source, expected) => {
    expect(arrangedListHref(kind, source)).toBe(expected);
  });
});
