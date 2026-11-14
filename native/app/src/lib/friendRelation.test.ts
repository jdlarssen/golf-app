// #2878: hvordan en annen spiller står til deg i venne-lista (Type A).
import type { FriendsData } from '../data/friends';
import { friendRelationFor } from './friendRelation';

const stats = { roundsTogether: 3, lastPlayedAt: '2026-11-01T10:00:00Z', lastGameName: 'Onsdagsgolf' };

function data(overrides: Partial<FriendsData> = {}): FriendsData {
  return {
    friends: [],
    incoming: [],
    outgoing: [],
    suggestions: [],
    friendCode: null,
    ...overrides,
  };
}

describe('friendRelationFor', () => {
  it('en venn', () => {
    const friend = { id: 'u1', name: 'Kari', stats, hcp: 9.4 };
    expect(friendRelationFor(data({ friends: [friend] }), 'u1')).toEqual({ kind: 'friend', person: friend });
  });

  it('en som har sendt deg en forespørsel, med forespørselens id', () => {
    const request = { id: 'u2', name: 'Ola', stats, requestId: 'req-1' };
    expect(friendRelationFor(data({ incoming: [request] }), 'u2')).toEqual({
      kind: 'incoming',
      requestId: 'req-1',
      person: request,
    });
  });

  it('en du har sendt en forespørsel til', () => {
    const request = { id: 'u3', name: 'Per', stats: null, requestId: 'req-2' };
    expect(friendRelationFor(data({ outgoing: [request] }), 'u3')).toEqual({ kind: 'outgoing', person: request });
  });

  it('en medspiller som ikke er noe av det: forslaget gir tallene', () => {
    const suggestion = { id: 'u4', name: 'Eva', stats };
    expect(friendRelationFor(data({ suggestions: [suggestion] }), 'u4')).toEqual({
      kind: 'none',
      person: suggestion,
    });
  });

  it('en som ikke står i noen liste: ingen venn, ingen tall', () => {
    expect(friendRelationFor(data(), 'ukjent')).toEqual({ kind: 'none', person: null });
  });

  it('står id-en i flere lister, vinner venn, så innkommende, så utgående', () => {
    const friend = { id: 'u5', name: 'A', stats, hcp: null };
    const incoming = { id: 'u5', name: 'A', stats, requestId: 'in' };
    const outgoing = { id: 'u5', name: 'A', stats, requestId: 'out' };
    expect(friendRelationFor(data({ friends: [friend], incoming: [incoming], outgoing: [outgoing] }), 'u5').kind).toBe(
      'friend',
    );
    expect(friendRelationFor(data({ incoming: [incoming], outgoing: [outgoing] }), 'u5').kind).toBe('incoming');
  });
});
