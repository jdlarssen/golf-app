/**
 * Type A for `setLeagueJoinLink` (#2662): the three modes, the club-league
 * refusal and the 0-row write. Lean mirror of `spectate.test.ts`; the gate
 * itself is `requireAdminOrClubAdminOfLeague`, tested where it lives.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSupabaseMock } from '@/tests/serverActionMocks';

vi.mock('@/lib/i18n/revalidateLocalePath', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getServerClient: vi.fn() }));
vi.mock('@/lib/admin/auth', () => ({ requireAdminOrClubAdminOfLeague: vi.fn() }));
vi.mock('server-only', () => ({}));

import { setLeagueJoinLink } from './joinLink';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdminOrClubAdminOfLeague } from '@/lib/admin/auth';

const mockServerClient = vi.mocked(getServerClient);
const mockGuard = vi.mocked(requireAdminOrClubAdminOfLeague);

function standalone() {
  mockGuard.mockResolvedValue({ userId: 'admin-1', groupId: null } as never);
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
    const client = buildSupabaseMock([{ data: { join_code: 'abcd2345' }, error: null }]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueJoinLink('league-1', 'on')).toEqual({ joinCode: 'abcd2345' });
    expect(updates(client)).toHaveLength(0);
  });

  it('on: draws a new code when the link is off', async () => {
    standalone();
    const client = buildSupabaseMock([
      { data: { join_code: null }, error: null },
      { data: [{ join_code: 'new23456' }], error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueJoinLink('league-1', 'on')).toEqual({ joinCode: 'new23456' });
    const [payload] = updates(client) as Array<{ join_code: string }>;
    expect(payload.join_code).toMatch(/^[0-9a-z]{8}$/);
  });

  it('rotate: writes a new code without reading the old one', async () => {
    standalone();
    const client = buildSupabaseMock([{ data: [{ join_code: 'new23456' }], error: null }]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueJoinLink('league-1', 'rotate')).toEqual({ joinCode: 'new23456' });
    expect(client.__fromCalls.filter((c) => c.method === 'maybeSingle')).toHaveLength(0);
    expect(updates(client)).toHaveLength(1);
  });

  it('rotate: draws once more when the code is taken (23505)', async () => {
    standalone();
    const client = buildSupabaseMock([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: [{ join_code: 'new23456' }], error: null },
    ]);
    mockServerClient.mockResolvedValue(client as never);

    expect(await setLeagueJoinLink('league-1', 'rotate')).toEqual({ joinCode: 'new23456' });
    expect(updates(client)).toHaveLength(2);
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
