import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Type A — promoteWaitlist (#2482): the loop over the queue. The rules (who
 * is first, whether a seat is free, the lock) are the SQL functions' and are
 * proven by supabase/tests/promote_waitlist_seat_test.sql; here the admin
 * client, the varsel and the mail are the system boundary and are mocked.
 */

type Game = {
  id: string;
  name: string;
  status: string;
  registration_mode: string;
  waitlist_enabled: boolean;
  signups_closed_at: string | null;
  game_mode: string;
  mode_config: { team_size?: number } | null;
  registration_cap: number | null;
};

let game: Game | null;
let held: number;
let queue: { request_id: string; user_id: string; place: number }[];
const promoteAnswers: unknown[] = [];
const rpc = vi.fn();
const notify = vi.fn();
const sendMail = vi.fn();
const expire = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpc(fn, args);
      if (fn === 'registration_seats_held') {
        return Promise.resolve({ data: [{ game_id: 'g1', seats: held }], error: null });
      }
      if (fn === 'registration_waitlist') {
        return Promise.resolve({ data: queue.map((r) => ({ game_id: 'g1', ...r })), error: null });
      }
      const answer = promoteAnswers.shift() ?? { outcome: 'ok' };
      if (answer instanceof Error) return Promise.resolve({ data: null, error: answer });
      // An ok seat leaves the queue, as the SQL does.
      if ((answer as { outcome: string }).outcome === 'ok') {
        queue = queue.slice(1).map((r) => ({ ...r, place: r.place - 1 }));
        held += 1;
      }
      return Promise.resolve({ data: answer, error: null });
    },
    from: (table: string) => {
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        maybeSingle: () => Promise.resolve({ data: table === 'games' ? game : null, error: null }),
        returns: () =>
          Promise.resolve({
            data: [{ id: 'u1', email: 'u1@example.test', locale: null }],
            error: null,
          }),
      };
      return b;
    },
  }),
}));
vi.mock('@/lib/notifications/notify', () => ({ notify: (o: unknown) => notify(o) }));
vi.mock('@/lib/mail/registrationApproved', () => ({
  sendRegistrationApprovedMail: (o: unknown) => sendMail(o),
}));
vi.mock('@/lib/games/expireGameCache', () => ({ expireGameCache: (id: string) => expire(id) }));
vi.mock('@/lib/games/joinTeeGenders', () => ({
  joinTeeGenders: (_g: string, ids: string[]) =>
    Promise.resolve(Object.fromEntries(ids.map((id) => [id, 'ladies']))),
}));

const openGame = (over: Partial<Game> = {}): Game => ({
  id: 'g1',
  name: 'Lørdagsrunden',
  status: 'scheduled',
  registration_mode: 'open',
  waitlist_enabled: true,
  signups_closed_at: null,
  game_mode: 'solo_strokeplay',
  mode_config: null,
  registration_cap: 3,
  ...over,
});

const q = (...users: string[]) => users.map((u, i) => ({ request_id: `r-${u}`, user_id: u, place: i + 1 }));

beforeEach(() => {
  game = openGame();
  held = 2;
  queue = q('u1', 'u2');
  promoteAnswers.length = 0;
  rpc.mockReset();
  notify.mockReset().mockResolvedValue({ shouldAlsoSendMail: false });
  sendMail.mockReset().mockResolvedValue(undefined);
  expire.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function run() {
  const { promoteWaitlist } = await import('./promoteWaitlist');
  return promoteWaitlist('g1');
}

const promoteCalls = () => rpc.mock.calls.filter(([fn]) => fn === 'promote_waitlist_seat');

describe('promoteWaitlist', () => {
  it('one free seat: the head gets it, with its tee category and the cap, and a varsel', async () => {
    expect(await run()).toEqual(['u1']);
    expect(promoteCalls()).toEqual([
      [
        'promote_waitlist_seat',
        { p_game_id: 'g1', p_request_id: 'r-u1', p_cap: 3, p_seat_team_size: 1, p_tee_gender: 'ladies' },
      ],
    ]);
    expect(notify).toHaveBeenCalledWith({
      userId: 'u1',
      kind: 'registration_approved',
      payload: { game_id: 'g1', game_name: 'Lørdagsrunden', fromWaitlist: true },
    });
    expect(expire).toHaveBeenCalledWith('g1');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('two free seats, three waiting: the first two, in order', async () => {
    held = 1;
    queue = q('u1', 'u2', 'u3');
    expect(await run()).toEqual(['u1', 'u2']);
    expect(promoteCalls()).toHaveLength(2);
  });

  it('the organiser cap below the format cap is the one passed', async () => {
    game = openGame({ game_mode: 'wolf', registration_cap: 4 });
    held = 3;
    await run();
    expect(promoteCalls()[0]![1]).toMatchObject({ p_cap: 4 });
  });

  it('full: no queue read, nothing promoted', async () => {
    held = 3;
    expect(await run()).toEqual([]);
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(['registration_seats_held']);
    expect(notify).not.toHaveBeenCalled();
  });

  it('an empty queue: nothing promoted, no varsel, no cache expiry', async () => {
    queue = [];
    expect(await run()).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<Game>]>([
    ['the list off', { waitlist_enabled: false }],
    ['manual approval', { registration_mode: 'manual_approval' }],
    ['closed by hand', { signups_closed_at: '2026-10-01T10:00:00Z' }],
    ['started', { status: 'active' }],
    ['matchplay', { game_mode: 'singles_matchplay', mode_config: { team_size: 1 } }],
    ['no cap at all', { registration_cap: null }],
  ])('%s: no RPC at all', async (_name, over) => {
    game = openGame(over);
    expect(await run()).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a claim took the seat first (game_full): stops, no varsel', async () => {
    promoteAnswers.push({ outcome: 'game_full', user_id: null });
    expect(await run()).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it('not_first (the queue moved): reads it again, within the free seats', async () => {
    held = 1;
    promoteAnswers.push({ outcome: 'not_first', user_id: null }, { outcome: 'ok' });
    expect(await run()).toEqual(['u1']);
    expect(promoteCalls()).toHaveLength(2);
  });

  it('an RPC error is logged and never thrown', async () => {
    promoteAnswers.push(new Error('boom'));
    expect(await run()).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it('a player away from the app gets the mail too, saying the list', async () => {
    notify.mockResolvedValue({ shouldAlsoSendMail: true });
    await run();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'u1@example.test', gameId: 'g1', fromWaitlist: true }),
    );
  });

  it('a failed varsel does not undo the seat', async () => {
    notify.mockRejectedValue(new Error('push down'));
    expect(await run()).toEqual(['u1']);
  });
});
