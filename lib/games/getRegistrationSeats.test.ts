import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SeatGame } from './getRegistrationSeats';

/**
 * Type A — getRegistrationSeats (#2258): which games get a cap, what the one
 * RPC is asked, how matchplay's «full» is read, and that an empty list makes
 * no call. The admin client is the system boundary and is mocked; the count
 * itself is the SQL function's (pgTAP: registration_seats_held_test.sql).
 */

type RpcResult = { data: { game_id: string; seats: number }[] | null; error: unknown };
type RosterResult = {
  data: { game_id: string; team_number: number | null; withdrawn_at: string | null }[] | null;
  error: unknown;
};

const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<RpcResult>>();
const rosterIn = vi.fn();
const roster = vi.fn<() => RosterResult>();
const from = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => rpc(fn, args),
    from: (table: string) => {
      from(table);
      const b = {
        select: () => b,
        in: (...args: unknown[]) => {
          rosterIn(...args);
          return b;
        },
        is: () => Promise.resolve(roster()),
      };
      return b;
    },
  }),
}));

beforeEach(() => {
  rpc.mockReset();
  rosterIn.mockReset();
  roster.mockReset();
  from.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const game = (id: string, game_mode: SeatGame['game_mode'], team_size?: number): SeatGame => ({
  id,
  game_mode,
  mode_config: team_size === undefined ? null : { team_size },
});

describe('getRegistrationSeats', () => {
  it('an empty list makes no call', async () => {
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    expect(await getRegistrationSeats([])).toEqual(new Map());
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('formats without a cap (and not matchplay) get no entry and no call', async () => {
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([
      game('s1', 'stableford', 1),
      game('s2', 'solo_strokeplay', 1),
    ]);
    expect(result.size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('asks one RPC for the capped games, with the signup’s seat team size, and maps cap + held', async () => {
    rpc.mockResolvedValue({
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

  it('a capped game the RPC returns no row for holds 0', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([game('w', 'wolf')]);
    expect(result.get('w')).toEqual({ kind: 'capped', cap: 5, held: 0 });
  });

  it('matchplay: full only when both sides are full, from one roster read', async () => {
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
    expect(rosterIn).toHaveBeenCalledWith('game_id', ['full', 'half', 'single']);
    expect(rpc).not.toHaveBeenCalled();
    expect(result.get('full')).toEqual({ kind: 'matchplay', full: true });
    expect(result.get('half')).toEqual({ kind: 'matchplay', full: false });
    expect(result.get('single')).toEqual({ kind: 'matchplay', full: false });
  });

  it('an RPC error leaves the capped games without an entry (best-effort)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    const { getRegistrationSeats } = await import('./getRegistrationSeats');
    const result = await getRegistrationSeats([game('tx', 'texas_scramble', 4)]);
    expect(result.size).toBe(0);
    expect(console.error).toHaveBeenCalled();
  });
});
