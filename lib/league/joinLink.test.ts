/**
 * Type A for `setLeagueJoinLink` (#2662): the three modes, the club-league
 * refusal and the 0-row write. Lean mirror of `spectate.test.ts`; the gate
 * itself is `requireAdminOrClubAdminOfLeague`, tested where it lives.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServerClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: vi.fn() }));
vi.mock('@/lib/admin/auth', () => ({ requireAdminOrClubAdminOfLeague: vi.fn() }));
vi.mock('server-only', () => ({}));

import { setLeagueJoinLink } from './joinLink';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';

const mockServerClient = vi.mocked(getServerClient);
const mockAdminClient = vi.mocked(getAdminClient);
const mockGuard = vi.mocked(requireAdminOrClubAdminOfLeague);

function standalone() {
  mockGuard.mockResolvedValue({ userId: 'admin-1', groupId: null } as never);
}

/** The code already set: read with the service role (0250 hides the column from a user session). */
function current(code: string | null) {
  const admin = buildSupabaseMock([{ data: { join_code: code }, error: null }]);
  mockAdminClient.mockReturnValue(admin as never);
  return admin;
}

function selects(client: ReturnType<typeof buildSupabaseMock>) {
  return client.__fromCalls.filter((c) => c.method === 'select').map((c) => c.args[0]);
}

function updates(client: ReturnType<typeof buildSupabaseMock>) {
  return client.__fromCalls.filter((c) => c.method === 'update').map((c) => c.args[0]);
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => errorSpy.mockRestore();
});

describe('setLeagueJoinLink', () => {
  it('refuses a club league without writing', async () => {
    mockGuard.mockResolvedValue({ userId: 'club-admin', groupId: 'club-1' } as never);
    const client = buildSupabaseMock([]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueJoinLink('league-1', 'on')).toEqual({ error: 'club_league' });
    expect(client.__fromCalls).toHaveLength(0);
  });

  it('on: keeps a code that is already set', async () => {
    standalone();
    current('abcd2345');
    const client = buildSupabaseMock([]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueJoinLink('league-1', 'on')).toEqual({ joinCode: 'abcd2345' });
    expect(updates(client)).toHaveLength(0);
  });

  it('on: draws a new code when the link is off, and returns the code it wrote', async () => {
    standalone();
    const admin = current(null);
    const client = buildSupabaseMock([{ data: [{ id: 'league-1' }], error: null }]);
    mockServerClient.mockResolvedValue(client as never);

    const result = await setLeagueJoinLink('league-1', 'on');
    const [payload] = updates(client) as Array<{ join_code: string }>;
    expect(payload.join_code).toMatch(/^[0-9a-z]{8}$/);
    expect(result).toEqual({ joinCode: payload.join_code });
    // The code is never selected through the caller's session.
    expect(selects(client)).toEqual(['id']);
    expect(selects(admin)).toEqual(['join_code']);
  });

  it('rotate: writes a new code without reading the old one', async () => {
    standalone();
    const client = buildSupabaseMock([{ data: [{ id: 'league-1' }], error: null }]);
    mockServerClient.mockResolvedValue(client as never);

    const result = await setLeagueJoinLink('league-1', 'rotate');
    expect(mockAdminClient).not.toHaveBeenCalled();
    const written = updates(client) as Array<{ join_code: string }>;
    expect(written).toHaveLength(1);
    expect(result).toEqual({ joinCode: written[0].join_code });
  });

  it('rotate: draws once more when the code is taken (23505), and returns the second code', async () => {
    standalone();
    const client = buildSupabaseMock([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: [{ id: 'league-1' }], error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    const result = await setLeagueJoinLink('league-1', 'rotate');
    const written = updates(client) as Array<{ join_code: string }>;
    expect(written).toHaveLength(2);
    expect(result).toEqual({ joinCode: written[1].join_code });
  });

  it('off: sets the code to null', async () => {
    standalone();
    const client = buildSupabaseMock([{ data: [{ id: 'league-1' }], error: null }]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueJoinLink('league-1', 'off')).toEqual({ joinCode: null });
    expect(updates(client)).toEqual([{ join_code: null }]);
  });

  it('a 0-row write is a failure, not a success (AGENTS.md trap 2)', async () => {
    standalone();
    const client = buildSupabaseMock([{ data: [], error: null }]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueJoinLink('league-1', 'off')).toEqual({ error: 'save_failed' });
  });
});
