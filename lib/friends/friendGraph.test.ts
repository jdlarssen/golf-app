import { describe, it, expect } from 'vitest';
import {
  otherParty,
  friendIdsFromRows,
  isUnansweredEmailRequestFrom,
  partitionFriendships,
  suggestionIds,
  distinctInviterIds,
  type FriendshipRow,
} from './friendGraph';

const ME = 'me';
const A = 'user-a';
const B = 'user-b';
const C = 'user-c';

function row(
  over: Partial<FriendshipRow> & Pick<FriendshipRow, 'requester_id' | 'addressee_id' | 'status'>,
): FriendshipRow {
  return { id: `${over.requester_id}->${over.addressee_id}`, ...over };
}

describe('otherParty', () => {
  it('returns the addressee when I am the requester', () => {
    expect(otherParty(row({ requester_id: ME, addressee_id: A, status: 'accepted' }), ME)).toBe(A);
  });
  it('returns the requester when I am the addressee', () => {
    expect(otherParty(row({ requester_id: A, addressee_id: ME, status: 'accepted' }), ME)).toBe(A);
  });
});

describe('friendIdsFromRows', () => {
  it('collects accepted friends in both directions and ignores pending', () => {
    const rows: FriendshipRow[] = [
      row({ requester_id: ME, addressee_id: A, status: 'accepted' }),
      row({ requester_id: B, addressee_id: ME, status: 'accepted' }),
      row({ requester_id: ME, addressee_id: C, status: 'pending' }),
    ];
    expect(friendIdsFromRows(rows, ME).sort()).toEqual([A, B]);
  });

  it('dedupes if the same pair somehow appears twice', () => {
    const rows: FriendshipRow[] = [
      row({ requester_id: ME, addressee_id: A, status: 'accepted' }),
      { id: 'dup', requester_id: A, addressee_id: ME, status: 'accepted' },
    ];
    expect(friendIdsFromRows(rows, ME)).toEqual([A]);
  });

  it('returns empty for no accepted rows', () => {
    expect(friendIdsFromRows([], ME)).toEqual([]);
  });
});

describe('a request sent to an e-mail address (0252)', () => {
  const mine = row({ requester_id: ME, addressee_id: A, status: 'pending', by_email: true });

  it('is left out of every list built for the sender while it waits', () => {
    expect(isUnansweredEmailRequestFrom(mine, ME)).toBe(true);
    const parts = partitionFriendships([mine], ME);
    expect(parts.outgoing).toEqual([]);
    expect(parts.friends).toEqual([]);
    expect([...parts.relatedIds]).toEqual([]);
    // The person stays a suggestion when the two have played together.
    expect(suggestionIds([A], parts.relatedIds, ME)).toEqual([A]);
  });

  it('is an ordinary incoming request for the person who received it', () => {
    expect(isUnansweredEmailRequestFrom(mine, A)).toBe(false);
    const parts = partitionFriendships([mine], A);
    expect(parts.incoming).toEqual([{ id: mine.id, otherId: ME }]);
  });

  it('is an ordinary friendship once it is accepted', () => {
    const accepted = { ...mine, status: 'accepted' as const };
    expect(isUnansweredEmailRequestFrom(accepted, ME)).toBe(false);
    expect(partitionFriendships([accepted], ME).friends).toEqual([{ otherId: A }]);
  });

  it('a request to a person picked from a list is listed as before', () => {
    const picked = row({ requester_id: ME, addressee_id: B, status: 'pending', by_email: false });
    expect(isUnansweredEmailRequestFrom(picked, ME)).toBe(false);
    expect(partitionFriendships([picked], ME).outgoing).toEqual([{ id: picked.id, otherId: B }]);
  });
});

describe('partitionFriendships', () => {
  it('buckets accepted / incoming / outgoing and tracks all related ids', () => {
    const rows: FriendshipRow[] = [
      row({ requester_id: ME, addressee_id: A, status: 'accepted' }),
      row({ requester_id: B, addressee_id: ME, status: 'pending' }), // incoming
      row({ requester_id: ME, addressee_id: C, status: 'pending' }), // outgoing
    ];
    const p = partitionFriendships(rows, ME);
    expect(p.friends).toEqual([{ otherId: A }]);
    expect(p.incoming).toEqual([{ id: `${B}->${ME}`, otherId: B }]);
    expect(p.outgoing).toEqual([{ id: `${ME}->${C}`, otherId: C }]);
    expect([...p.relatedIds].sort()).toEqual([A, B, C]);
  });

  it('classifies a pending row I sent as outgoing even if I am requester', () => {
    const p = partitionFriendships(
      [row({ requester_id: ME, addressee_id: A, status: 'pending' })],
      ME,
    );
    expect(p.outgoing).toHaveLength(1);
    expect(p.incoming).toHaveLength(0);
  });
});

describe('suggestionIds', () => {
  it('keeps co-players with no existing relation, drops self and related', () => {
    const related = new Set([A]);
    expect(suggestionIds([A, B, C, ME], related, ME).sort()).toEqual([B, C]);
  });

  it('dedupes the co-player list', () => {
    expect(suggestionIds([B, B, C], new Set<string>(), ME).sort()).toEqual([B, C]);
  });

  it('returns empty when every co-player is already related', () => {
    expect(suggestionIds([A, B], new Set([A, B]), ME)).toEqual([]);
  });
});

describe('distinctInviterIds', () => {
  it('dedupes multiple invites from the same inviter into one id', () => {
    const invites = [
      { game_id: 'g1', invited_by: A },
      { game_id: 'g2', invited_by: A },
    ];
    expect(distinctInviterIds(invites, ME)).toEqual([A]);
  });

  it('collects all distinct inviters', () => {
    const invites = [
      { game_id: 'g1', invited_by: A },
      { game_id: 'g2', invited_by: B },
    ];
    expect(distinctInviterIds(invites, ME).sort()).toEqual([A, B]);
  });

  it('excludes the invitee themselves as inviter', () => {
    const invites = [
      { game_id: 'g1', invited_by: ME },
      { game_id: 'g2', invited_by: A },
    ];
    expect(distinctInviterIds(invites, ME)).toEqual([A]);
  });

  it('includes game-less invites (#2212)', () => {
    const invites = [
      { game_id: null, invited_by: A },
      { game_id: 'g2', invited_by: B },
    ];
    expect(distinctInviterIds(invites, ME).sort()).toEqual([A, B]);
  });

  it('returns empty for no invites', () => {
    expect(distinctInviterIds([], ME)).toEqual([]);
  });
});
