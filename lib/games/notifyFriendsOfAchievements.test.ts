import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';
import type { BragRound } from './notifyAchievementUnlocks';

// The round itself is read by the shared helper (tested through
// notifyAchievementUnlocks); here it is a fixture.
let round: BragRound | null;
vi.mock('@/lib/games/notifyAchievementUnlocks', () => ({
  readBragRound: async () => round,
}));

let admin: ReturnType<typeof buildSupabaseMock>;
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => admin }));

const readFriendIdsMock = vi.fn<(userId: string) => Promise<string[]>>();
vi.mock('@/lib/friends/getFriendIds', () => ({
  readFriendIds: (userId: string) => readFriendIdsMock(userId),
}));

const notifyMock = vi.fn<(opts: unknown) => Promise<{ shouldAlsoSendMail: boolean }>>();
vi.mock('@/lib/notifications/notify', () => ({
  notify: (opts: unknown) => notifyMock(opts),
}));

import { notifyFriendsOfAchievements } from './notifyFriendsOfAchievements';

const GAME = '11111111-1111-1111-1111-111111111111';
const ROUND_ID = '22222222-2222-2222-2222-222222222222';
const LEAGUE = '33333333-3333-3333-3333-333333333333';
const OLA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const KARI = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const LIV = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const NILS = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const par4 = (holeNumber: number, strokes: number | null) => ({ holeNumber, strokes, par: 4 });

/** Ola eagles 4 and aces 12; Kari plays to par. Both on the roster. */
function friendRound(): BragRound {
  return {
    game: { name: 'Lørdagsrunden', course_id: 'course-1', game_mode: 'stableford', league_round_id: null },
    rosterIds: [OLA, KARI],
    players: [
      { userId: OLA, holes: [par4(4, 2), par4(12, 1), par4(13, 3)] },
      { userId: KARI, holes: [par4(4, 4), par4(12, 4)] },
    ],
  };
}

/** Tables the sender reads besides the round, in the order a test needs them. */
function adminWith(byTable: Record<string, { data: unknown; error: unknown }[]>) {
  return buildSupabaseMock([], {}, {
    byTable: {
      courses: [{ data: { name: 'Bogstad' }, error: null }],
      users: [{ data: [{ id: OLA, name: 'Ola Nordmann' }, { id: KARI, name: 'Kari' }], error: null }],
      ...byTable,
    },
  });
}

const sentTo = () => notifyMock.mock.calls.map(([opts]) => (opts as { userId: string }).userId);

beforeEach(() => {
  notifyMock.mockReset().mockResolvedValue({ shouldAlsoSendMail: false });
  readFriendIdsMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('notifyFriendsOfAchievements', () => {
  it('one notice per friend, with every moment in one payload, never to someone from the game', async () => {
    round = friendRound();
    admin = adminWith({});
    readFriendIdsMock.mockImplementation(async (id) => (id === OLA ? [KARI, PER, NILS] : []));

    const sent = await notifyFriendsOfAchievements(GAME);

    expect(sent).toBe(2);
    expect(readFriendIdsMock).toHaveBeenCalledTimes(1);
    expect(readFriendIdsMock).toHaveBeenCalledWith(OLA);
    expect(sentTo()).toEqual([PER, NILS]);
    expect(notifyMock).toHaveBeenCalledWith({
      userId: PER,
      kind: 'friend_achievement',
      payload: {
        game_id: GAME,
        player_id: OLA,
        player_name: 'Ola Nordmann',
        course_name: 'Bogstad',
        league_id: null,
        moments: [
          { kind: 'eagle', hole_number: 4 },
          { kind: 'hole_in_one', hole_number: 12 },
        ],
      },
    });
  });

  it('nobody got anything: no reads of friends, no notices', async () => {
    round = { ...friendRound(), players: [{ userId: KARI, holes: [par4(4, 3)] }] };
    admin = adminWith({});

    expect(await notifyFriendsOfAchievements(GAME)).toBe(0);
    expect(readFriendIdsMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a failed notice to one friend does not stop the others', async () => {
    round = friendRound();
    admin = adminWith({});
    readFriendIdsMock.mockResolvedValue([PER, NILS, LIV]);
    notifyMock.mockImplementation(async (opts) => {
      if ((opts as { userId: string }).userId === NILS) throw new Error('boom');
      return { shouldAlsoSendMail: false };
    });

    expect(await notifyFriendsOfAchievements(GAME)).toBe(2);
    expect(sentTo()).toEqual([PER, NILS, LIV]);
  });

  it('a failed read of friends gives no notices and never throws', async () => {
    round = friendRound();
    admin = adminWith({});
    readFriendIdsMock.mockRejectedValue(new Error('friendships down'));

    await expect(notifyFriendsOfAchievements(GAME)).resolves.toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a league round tells the other league players, not friends, and links the league', async () => {
    round = { ...friendRound(), game: { ...friendRound().game, league_round_id: ROUND_ID } };
    admin = adminWith({
      league_rounds: [{ data: { league_id: LEAGUE }, error: null }],
      league_players: [
        { data: [{ user_id: OLA }, { user_id: KARI }, { user_id: LIV }, { user_id: PER }], error: null },
      ],
    });
    readFriendIdsMock.mockResolvedValue([NILS]);

    expect(await notifyFriendsOfAchievements(GAME)).toBe(2);
    expect(readFriendIdsMock).not.toHaveBeenCalled();
    expect(sentTo()).toEqual([LIV, PER]);
    expect((notifyMock.mock.calls[0][0] as { payload: { league_id: string } }).payload.league_id).toBe(LEAGUE);
  });

  it('a failed read of the league gives no notices and never throws', async () => {
    round = { ...friendRound(), game: { ...friendRound().game, league_round_id: ROUND_ID } };
    admin = adminWith({
      league_rounds: [{ data: { league_id: LEAGUE }, error: null }],
      league_players: [{ data: null, error: { message: 'down' } }],
    });

    await expect(notifyFriendsOfAchievements(GAME)).resolves.toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a missing name or course is sent as null; the card fills the fallback', async () => {
    round = friendRound();
    admin = adminWith({
      courses: [{ data: null, error: { message: 'down' } }],
      users: [{ data: [], error: null }],
    });
    readFriendIdsMock.mockResolvedValue([PER]);

    expect(await notifyFriendsOfAchievements(GAME)).toBe(1);
    expect(notifyMock.mock.calls[0][0]).toMatchObject({
      payload: { player_name: null, course_name: null },
    });
  });

  it('the round could not be read: nothing is sent', async () => {
    round = null;
    admin = adminWith({});

    expect(await notifyFriendsOfAchievements(GAME)).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
