import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SeatGame } from './getRegistrationSeats';

/**
 * Type A — getRegistrationSeats (#2258, #2482): which games get a cap (the
 * format's or the organiser's, whichever is lower), what the RPCs are asked,
 * the waiting-list count, how matchplay's «full» is read, and that an empty
 * list makes no call. The admin client is the system boundary and is mocked;
 * the counts themselves are the SQL functions' (pgTAP:
 * registration_seats_held_test.sql, promote_waitlist_seat_test.sql).
 */

type HeldResult = { data: { game_id: string; seats: number }[] | null; error: unknown };
type WaitlistResult = { data: { game_id: string }[] | null; error: unknown };
type SettingsRow = {
  id: string;
  registration_cap: number | null;
  waitlist_enabled: boolean;
  registration_mode: 'invite_only' | 'manual_approval' | 'open';
};
type RosterResult = {
  data: { game_id: string; team_number: number | null; withdrawn_at: string | null }[] | null;
  error: unknown;
};

const held = vi.fn<(args: Record<string, unknown>) => HeldResult>();
const waitlist = vi.fn<(args: Record<string, unknown>) => WaitlistResult>();
const rpc = vi.fn();
const inCalls = vi.fn();
const settings = vi.fn<() => { data: SettingsRow[] | null; error: unknown }>();
const roster = vi.fn<() => RosterResult>();
const from = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpc(fn, args);
      return Promise.resolve(fn === 'registration_waitlist' ? waitlist(args) : held(args));
    },
    from: (table: string) => {
      from(table);
      const b = {
        select: () => b,
        in: (...args: unknown[]) => {
          inCalls(table, ...args);
          return b;
        },
        returns: () => Promise.resolve(settings()),
        is: () => Promise.resolve(roster()),
      };
      return b;
    },
  }),
}));

beforeEach(() => {
  held.mockReset();
  waitlist.mockReset();
  rpc.mockReset();
  inCalls.mockReset();
  settings.mockReset();
  roster.mockReset();
  from.mockReset();
  settings.mockReturnValue({ data: [], error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const game = (id: string, game_mode: SeatGame['game_mode'], team_size?: number): SeatGame => ({
  id,
  game_mode,
  mode_config: team_size === undefined ? null : { team_size },
});

const row = (
  id: string,
  registration_cap: number | null,
  waitlist_enabled = false,
  registration_mode: SettingsRow['registration_mode'] = 'open',
): SettingsRow => ({ id, registration_cap, waitlist_enabled, registration_mode });

describe('getRegistrationSeats', () => {
  it('an empty list makes no call', async () => {
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    expect(await getRegistrationSeats([])).toEqual(new Map());
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('formats without a cap and no organiser cap: one settings read, no entry, no RPC', async () => {
    settings.mockReturnValue({ data: [row('s1', null), row('s2', null)], error: null });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([
      game('s1', 'stableford', 1),
      game('s2', 'solo_strokeplay', 1),
    ]);
    expect(result.size).toBe(0);
    expect(from).toHaveBeenCalledWith('games');
    expect(inCalls).toHaveBeenCalledWith('games', 'id', ['s1', 's2']);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('asks one RPC for the capped games, with the signup’s seat team size, and maps cap + held', async () => {
    held.mockReturnValue({
      data: [
        { game_id: 'tx', seats: 8 },
        { game_id: 'sk', seats: 14 },
      ],
      error: null,
    });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([
      game('tx', 'texas_scramble', 4),
      game('sf', 'stableford', 1),
      game('sk', 'skins', 1),
      game('tx', 'texas_scramble', 4), // listed twice → asked once
    ]);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('registration_seats_held', {
      p_game_ids: ['tx', 'sk'],
      p_seat_team_sizes: [4, 1],
    });
    expect(result.get('tx')).toEqual({ kind: 'capped', cap: 40, held: 8 });
    expect(result.get('sk')).toEqual({ kind: 'capped', cap: 16, held: 14 });
    expect(result.has('sf')).toBe(false);
  });

  it('#2482: the organiser cap caps a format without one, and the lower cap wins', async () => {
    settings.mockReturnValue({ data: [row('sf', 3), row('tx', 12), row('w', 50)], error: null });
    held.mockReturnValue({ data: [{ game_id: 'sf', seats: 3 }], error: null });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([
      game('sf', 'stableford', 1),
      game('tx', 'texas_scramble', 4),
      game('w', 'wolf'),
    ]);
    expect(result.get('sf')).toEqual({ kind: 'capped', cap: 3, held: 3 });
    expect(result.get('tx')).toEqual({ kind: 'capped', cap: 12, held: 0 });
    // Wolf's own cap (5) is lower than the organiser's 50.
    expect(result.get('w')).toEqual({ kind: 'capped', cap: 5, held: 0 });
  });

  it('#2482: an open round with the list on gets the waiting-list count; others get none', async () => {
    settings.mockReturnValue({
      data: [
        row('on', 3, true, 'open'),
        row('empty', 3, true, 'open'),
        row('off', 3, false, 'open'),
        row('manual', 3, true, 'manual_approval'),
      ],
      error: null,
    });
    held.mockReturnValue({ data: [], error: null });
    waitlist.mockReturnValue({ data: [{ game_id: 'on' }, { game_id: 'on' }], error: null });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([
      game('on', 'stableford', 1),
      game('empty', 'stableford', 1),
      game('off', 'stableford', 1),
      game('manual', 'stableford', 1),
    ]);
    expect(rpc).toHaveBeenCalledWith('registration_waitlist', { p_game_ids: ['on', 'empty'] });
    expect(result.get('on')).toEqual({ kind: 'capped', cap: 3, held: 0, waitlist: 2 });
    expect(result.get('empty')).toEqual({ kind: 'capped', cap: 3, held: 0, waitlist: 0 });
    expect(result.get('off')).toEqual({ kind: 'capped', cap: 3, held: 0 });
    expect(result.get('manual')).toEqual({ kind: 'capped', cap: 3, held: 0 });
  });

  it('#2482: a failed waiting-list read drops only the count', async () => {
    settings.mockReturnValue({ data: [row('on', 3, true)], error: null });
    held.mockReturnValue({ data: [{ game_id: 'on', seats: 3 }], error: null });
    waitlist.mockReturnValue({ data: null, error: { message: 'boom' } });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([game('on', 'stableford', 1)]);
    expect(result.get('on')).toEqual({ kind: 'capped', cap: 3, held: 3 });
    expect(console.error).toHaveBeenCalled();
  });

  it('#2482: a failed settings read leaves the non-matchplay games without an entry', async () => {
    settings.mockReturnValue({ data: null, error: { message: 'boom' } });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([game('w', 'wolf')]);
    expect(result.size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('a capped game the RPC returns no row for holds 0', async () => {
    held.mockReturnValue({ data: [], error: null });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([game('w', 'wolf')]);
    expect(result.get('w')).toEqual({ kind: 'capped', cap: 5, held: 0 });
  });

  it('matchplay: full only when both sides are full, from one roster read, no settings read', async () => {
    roster.mockReturnValue({
      data: [
        { game_id: 'full', team_number: 1, withdrawn_at: null },
        { game_id: 'full', team_number: 1, withdrawn_at: null },
        { game_id: 'full', team_number: 2, withdrawn_at: null },
        { game_id: 'full', team_number: 2, withdrawn_at: null },
        { game_id: 'half', team_number: 1, withdrawn_at: null },
        { game_id: 'half', team_number: 1, withdrawn_at: null },
      ],
      error: null,
    });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([
      game('full', 'fourball_matchplay', 2),
      game('half', 'fourball_matchplay', 2),
      game('single', 'singles_matchplay', 1),
    ]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('game_players');
    expect(inCalls).toHaveBeenCalledWith('game_players', 'game_id', ['full', 'half', 'single']);
    expect(rpc).not.toHaveBeenCalled();
    expect(result.get('full')).toEqual({ kind: 'matchplay', full: true });
    expect(result.get('half')).toEqual({ kind: 'matchplay', full: false });
    expect(result.get('single')).toEqual({ kind: 'matchplay', full: false });
  });

  it('an RPC error leaves the capped games without an entry (best-effort)', async () => {
    held.mockReturnValue({ data: null, error: { message: 'function does not exist' } });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([game('tx', 'texas_scramble', 4)]);
    expect(result.size).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });
});
