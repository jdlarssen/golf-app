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
  it('gates on requireAdminOrClubAdminOfLeague before writing', async () => {
    const client = buildSupabaseMock([
      { data: { spectate_token: 'existing' }, error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    await setLeagueEmbed('league-1', true);
    expect(mockGuard).toHaveBeenCalledWith(expect.anything(), 'league-1');
  });

  it('generates and saves a new token when spectate_token is null', async () => {
    const client = buildSupabaseMock([
      { data: { spectate_token: null }, error: null },
      { data: [{ spectate_token: VALID_UUID }], error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueEmbed('league-1', true)).toBe(VALID_UUID);
    expect(
      client.__fromCalls.filter((c) => c.method === 'update').length,
    ).toBeGreaterThan(0);
  });

  it('returns existing token without rotating when already enabled', async () => {
    const client = buildSupabaseMock([
      { data: { spectate_token: 'existing-token' }, error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueEmbed('league-1', true)).toBe('existing-token');
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
    const client = buildSupabaseMock([
      { data: { spectate_token: null }, error: null },
      { data: [], error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    await expect(setLeagueEmbed('league-1', true)).rejects.toBeInstanceOf(
      NoRowsAffectedError,
    );
  });
});
