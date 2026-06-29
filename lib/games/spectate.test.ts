/**
 * Unit-tester for lib/games/spectate.ts (#938).
 *
 * Type A (logic): token-valideringslogikk i getGameBySpectateToken og
 * expected-affected-rows-assertion i setLiveFollow. DB og cache mockets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

// --- Module mocks ---------------------------------------------------------

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: vi.fn(),
}));

// server-only guard — not needed in test environment
vi.mock('server-only', () => ({}));

// -------------------------------------------------------------------------

import { getGameBySpectateToken, setLiveFollow } from './spectate';
import { getAdminClient } from '@/lib/supabase/admin';
import { getServerClient } from '@/lib/supabase/server';
import { NoRowsAffectedError } from '@/lib/supabase/affectedRows';

const mockAdminClient = vi.mocked(getAdminClient);
const mockServerClient = vi.mocked(getServerClient);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getGameBySpectateToken ──────────────────────────────────────────────

describe('getGameBySpectateToken', () => {
  it('returns null immediately for a non-UUID string (no DB call)', async () => {
    const client = buildSupabaseMock([]);
    mockAdminClient.mockReturnValue(client as never);

    const result = await getGameBySpectateToken('not-a-uuid');
    expect(result).toBeNull();
    // Admin client from() must not have been called.
    expect(client.__fromCalls).toHaveLength(0);
  });

  it('returns null for an empty string', async () => {
    const client = buildSupabaseMock([]);
    mockAdminClient.mockReturnValue(client as never);
    expect(await getGameBySpectateToken('')).toBeNull();
    expect(client.__fromCalls).toHaveLength(0);
  });

  it('returns null for a string that looks like UUID but has wrong format', async () => {
    const client = buildSupabaseMock([]);
    mockAdminClient.mockReturnValue(client as never);
    // Missing one hex group
    expect(await getGameBySpectateToken('aaaaaaaa-bbbb-cccc-dddd')).toBeNull();
    expect(client.__fromCalls).toHaveLength(0);
  });

  it('queries DB for a valid UUID and returns null when not found', async () => {
    const client = buildSupabaseMock([{ data: null, error: null }]);
    mockAdminClient.mockReturnValue(client as never);

    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = await getGameBySpectateToken(uuid);
    expect(result).toBeNull();
    expect(client.__fromCalls.some((c) => c.table === 'games')).toBe(true);
  });

  it('queries DB for a valid UUID and returns {id} when found', async () => {
    const gameId = 'game-uuid-1234';
    const client = buildSupabaseMock([{ data: { id: gameId }, error: null }]);
    mockAdminClient.mockReturnValue(client as never);

    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = await getGameBySpectateToken(uuid);
    expect(result).toEqual({ id: gameId });
  });

  it('returns null on DB error (logs to console.error)', async () => {
    const client = buildSupabaseMock([
      { data: null, error: { message: 'DB error' } },
    ]);
    mockAdminClient.mockReturnValue(client as never);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = await getGameBySpectateToken(uuid);
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      '[getGameBySpectateToken] lookup failed',
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });
});

// ─── setLiveFollow ────────────────────────────────────────────────────────

describe('setLiveFollow — enable', () => {
  it('generates and saves a new token when spectate_token is null', async () => {
    const expectedToken = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const client = buildSupabaseMock([
      // 1st call: current token lookup → null (not yet enabled)
      { data: { spectate_token: null }, error: null },
      // 2nd call: update → returns the new token row (mock returns our fixture)
      { data: [{ spectate_token: expectedToken }], error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    const result = await setLiveFollow('game-1', true);
    // The action returns what the DB update select returned.
    expect(result).toBe(expectedToken);
    // An update call must have been issued.
    const updateCalls = client.__fromCalls.filter(
      (c) => c.method === 'update',
    );
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  it('returns existing token without rotating when already enabled', async () => {
    const existing = 'existing-token-uuid';
    const client = buildSupabaseMock([
      // 1st call: current token lookup → has existing token
      { data: { spectate_token: existing }, error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    const result = await setLiveFollow('game-1', true);
    expect(result).toBe(existing);
    // Should NOT have attempted an update (only 1 DB call made)
    const updateCalls = client.__fromCalls.filter(
      (c) => c.method === 'update',
    );
    expect(updateCalls).toHaveLength(0);
  });

  it('throws NoRowsAffectedError on 0-row write (AGENTS.md trap #2)', async () => {
    const client = buildSupabaseMock([
      // 1st call: token is null → proceed to update
      { data: { spectate_token: null }, error: null },
      // 2nd call: update → 0 rows (RLS blocked or wrong id)
      { data: [], error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    await expect(setLiveFollow('game-1', true)).rejects.toBeInstanceOf(
      NoRowsAffectedError,
    );
  });
});

describe('setLiveFollow — disable', () => {
  it('nullifies spectate_token and returns null', async () => {
    const client = buildSupabaseMock([
      // update → returns 1 row
      { data: [{ id: 'game-1' }], error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    const result = await setLiveFollow('game-1', false);
    expect(result).toBeNull();
  });

  it('throws NoRowsAffectedError on 0-row write when disabling', async () => {
    const client = buildSupabaseMock([
      // update → 0 rows
      { data: [], error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    await expect(setLiveFollow('game-1', false)).rejects.toBeInstanceOf(
      NoRowsAffectedError,
    );
  });
});
