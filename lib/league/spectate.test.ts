/**
 * Unit-tester for lib/league/spectate.ts (#1024).
 *
 * Type A (logic): token-valideringen i getLeagueBySpectateToken og
 * toggle-/affected-rows-logikken i setLeagueEmbed. Slank speil av
 * lib/games/spectate.test.ts (#938) — mønsteret er dekket grundig der;
 * her testes kun denne modulens egne grener.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

// --- Module mocks ---------------------------------------------------------

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: vi.fn(),
}));

vi.mock('@/lib/admin/auth', () => ({
  requireAdminOrClubAdminOfLeague: vi.fn(),
}));

// server-only guard — not needed in test environment
vi.mock('server-only', () => ({}));

// -------------------------------------------------------------------------

import { getLeagueBySpectateToken, setLeagueEmbed } from './spectate';
import { getAdminClient } from '@/lib/supabase/admin';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';
import { NoRowsAffectedError } from '@/lib/supabase/affectedRows';

const mockAdminClient = vi.mocked(getAdminClient);
const mockServerClient = vi.mocked(getServerClient);
const mockGuard = vi.mocked(requireAdminOrClubAdminOfLeague);

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getLeagueBySpectateToken ────────────────────────────────────────────

describe('getLeagueBySpectateToken', () => {
  it('returns null immediately for a non-UUID string (no DB call)', async () => {
    const client = buildSupabaseMock([]);
    mockAdminClient.mockReturnValue(client as never);

    expect(await getLeagueBySpectateToken('not-a-uuid')).toBeNull();
    expect(client.__fromCalls).toHaveLength(0);
  });

  it('queries leagues for a valid UUID and returns {id} when found', async () => {
    const client = buildSupabaseMock([
      { data: { id: 'league-1' }, error: null },
    ]);
    mockAdminClient.mockReturnValue(client as never);

    expect(await getLeagueBySpectateToken(VALID_UUID)).toEqual({
      id: 'league-1',
    });
    expect(client.__fromCalls.some((c) => c.table === 'leagues')).toBe(true);
  });
});

// ─── setLeagueEmbed ──────────────────────────────────────────────────────

describe('setLeagueEmbed', () => {
  /** The token already set: read with the service role (0250 hides the column from a user session). */
  function current(token: string | null, error: { message: string } | null = null) {
    const admin = buildSupabaseMock([{ data: error ? null : { spectate_token: token }, error }]);
    mockAdminClient.mockReturnValue(admin as never);
    return admin;
  }

  it('gates on requireAdminOrClubAdminOfLeague before writing', async () => {
    current('existing');
    mockServerClient.mockResolvedValue(buildSupabaseMock([]) as never);

    await setLeagueEmbed('league-1', true);
    expect(mockGuard).toHaveBeenCalledWith(expect.anything(), 'league-1');
  });

  it('generates and saves a new token when spectate_token is null', async () => {
    current(null);
    const client = buildSupabaseMock([{ data: [{ id: 'league-1' }], error: null }]);
    mockServerClient.mockResolvedValue(client as never);

    const token = await setLeagueEmbed('league-1', true);
    const updates = client.__fromCalls.filter((c) => c.method === 'update').map((c) => c.args[0]);
    // The token returned is the one written: the write asks back `id` only.
    expect(updates).toEqual([{ spectate_token: token }]);
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns existing token without rotating when already enabled', async () => {
    current('existing-token');
    const client = buildSupabaseMock([]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueEmbed('league-1', true)).toBe('existing-token');
    expect(client.__fromCalls.filter((c) => c.method === 'update')).toHaveLength(0);
  });

  it('never selects the token through the caller\'s session', async () => {
    const admin = current(null);
    const client = buildSupabaseMock([{ data: [{ id: 'league-1' }], error: null }]);
    mockServerClient.mockResolvedValue(client as never);

    await setLeagueEmbed('league-1', true);
    const selects = (c: ReturnType<typeof buildSupabaseMock>) =>
      c.__fromCalls.filter((call) => call.method === 'select').map((call) => call.args[0]);
    expect(selects(client)).toEqual(['id']);
    expect(selects(admin)).toEqual(['spectate_token']);
  });

  it('a failed read of the current token throws and writes nothing', async () => {
    current(null, { message: 'boom' });
    const client = buildSupabaseMock([]);
    mockServerClient.mockResolvedValue(client as never);

    await expect(setLeagueEmbed('league-1', true)).rejects.toThrow('setLeagueEmbed:read');
    expect(client.__fromCalls.filter((c) => c.method === 'update')).toHaveLength(0);
  });

  it('nullifies the token on disable and returns null', async () => {
    const client = buildSupabaseMock([
      { data: [{ id: 'league-1' }], error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueEmbed('league-1', false)).toBeNull();
  });

  it('throws NoRowsAffectedError on 0-row write (AGENTS.md trap #2)', async () => {
    current(null);
    const client = buildSupabaseMock([{ data: [], error: null }]);
    mockServerClient.mockResolvedValue(client as never);

    await expect(setLeagueEmbed('league-1', true)).rejects.toBeInstanceOf(
      NoRowsAffectedError,
    );
  });
});
