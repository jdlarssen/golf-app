import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';
import { canOpenLeagueCards, canViewLeague } from './canViewLeague';

function client(byTable: Record<string, QueryResult[]>) {
  return buildSupabaseMock([], {}, { byTable }) as unknown as SupabaseClient<Database> & {
    __fromCalls: Array<{ table: string }>;
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('canViewLeague', () => {
  it('a standalone league is open to every signed-in user, with no reads', async () => {
    const supabase = client({});
    await expect(
      canViewLeague(supabase, { groupId: null, userId: 'u1', isParticipant: false }),
    ).resolves.toEqual({ allowed: true, isClubMember: false });
    expect(supabase.__fromCalls).toHaveLength(0);
  });

  it('a participant of a club league gets in without a membership read', async () => {
    const supabase = client({});
    await expect(
      canViewLeague(supabase, { groupId: 'g1', userId: 'u1', isParticipant: true }),
    ).resolves.toEqual({ allowed: true, isClubMember: false });
    expect(supabase.__fromCalls).toHaveLength(0);
  });

  it('a club member who is not a participant gets in, and is marked a member', async () => {
    const supabase = client({
      group_members: [{ data: { user_id: 'u1' } }],
      users: [{ data: { is_admin: false } }],
    });
    await expect(
      canViewLeague(supabase, { groupId: 'g1', userId: 'u1', isParticipant: false }),
    ).resolves.toEqual({ allowed: true, isClubMember: true });
  });

  it('a global admin outside the club gets in', async () => {
    const supabase = client({
      group_members: [{ data: null }],
      users: [{ data: { is_admin: true } }],
    });
    await expect(
      canViewLeague(supabase, { groupId: 'g1', userId: 'admin', isParticipant: false }),
    ).resolves.toEqual({ allowed: true, isClubMember: false });
  });

  it('an outsider is refused', async () => {
    const supabase = client({
      group_members: [{ data: null }],
      users: [{ data: { is_admin: false } }],
    });
    await expect(
      canViewLeague(supabase, { groupId: 'g1', userId: 'u9', isParticipant: false }),
    ).resolves.toEqual({ allowed: false, isClubMember: false });
  });

  it('no user is refused for a club league', async () => {
    await expect(
      canViewLeague(client({}), { groupId: 'g1', userId: null, isParticipant: false }),
    ).resolves.toEqual({ allowed: false, isClubMember: false });
  });

  it('a failed read throws: neither a pass nor a «not found» (the orchestrator\'s review)', async () => {
    const supabase = client({
      group_members: [{ data: null, error: { message: 'boom' } }],
      users: [{ data: { is_admin: true } }],
    });
    await expect(
      canViewLeague(supabase, { groupId: 'g1', userId: 'admin', isParticipant: false }),
    ).rejects.toThrow('canViewLeague: the access read failed');
  });
});

describe('canOpenLeagueCards — the card behind a cell is narrower than the table', () => {
  const ask = (
    supabase: SupabaseClient<Database>,
    over: Partial<Parameters<typeof canOpenLeagueCards>[1]> = {},
  ) =>
    canOpenLeagueCards(supabase, {
      groupId: null,
      createdBy: 'org',
      userId: 'u1',
      isParticipant: false,
      ...over,
    });

  it('a participant opens cards, with no reads', async () => {
    const supabase = client({});
    await expect(ask(supabase, { isParticipant: true })).resolves.toBe(true);
    expect(supabase.__fromCalls).toHaveLength(0);
  });

  it('the creator opens cards, with no reads', async () => {
    const supabase = client({});
    await expect(ask(supabase, { userId: 'org' })).resolves.toBe(true);
    expect(supabase.__fromCalls).toHaveLength(0);
  });

  it('a global admin opens cards', async () => {
    await expect(ask(client({ users: [{ data: { is_admin: true } }] }))).resolves.toBe(true);
  });

  it.each(['owner', 'admin'])('a club %s opens the cards of a club league', async (role) => {
    const supabase = client({
      users: [{ data: { is_admin: false } }],
      group_members: [{ data: { role } }],
    });
    await expect(ask(supabase, { groupId: 'g1' })).resolves.toBe(true);
  });

  it('a club member who is not a participant does not', async () => {
    const supabase = client({
      users: [{ data: { is_admin: false } }],
      group_members: [{ data: { role: 'member' } }],
    });
    await expect(ask(supabase, { groupId: 'g1' })).resolves.toBe(false);
  });

  it('a signed-in user outside a league without a club does not, and no club is read', async () => {
    const supabase = client({ users: [{ data: { is_admin: false } }] });
    await expect(ask(supabase)).resolves.toBe(false);
    expect(supabase.__fromCalls.map((c) => c.table)).not.toContain('group_members');
  });

  it('no user does not', async () => {
    await expect(ask(client({}), { userId: null, isParticipant: false })).resolves.toBe(false);
  });

  it('a failed read throws: neither a pass nor a refusal', async () => {
    const supabase = client({ users: [{ data: null, error: { message: 'boom' } }] });
    await expect(ask(supabase)).rejects.toThrow('canOpenLeagueCards: the access read failed');
  });
});
