import { describe, it, expect } from 'vitest';
import { buildSupabaseMock, type QueryResult } from '@/tests/serverActionMocks';
import { resolveGameClubId } from './gameClubId';

/**
 * Type A (#2433, #442, #50). The club a new or resumed game may be saved
 * with: a club the caller is a member of (any role) that has not expired.
 * Anything else is dropped to null, never an error.
 */
describe('resolveGameClubId', () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString();

  it.each<[string, QueryResult, string | null]>([
    ['medlem, klubb uten sluttdato', { data: { group_id: 'club-1', groups: { valid_until: null } }, error: null }, 'club-1'],
    ['medlem, klubb som utløper neste år', { data: { group_id: 'club-1', groups: { valid_until: nextYear } }, error: null }, 'club-1'],
    ['ingen rad i group_members', { data: null, error: null }, null],
    ['utløpt klubb', { data: { group_id: 'club-1', groups: { valid_until: yesterday } }, error: null }, null],
  ])('%s → %s', async (_label, membership, expected) => {
    const supabase = buildSupabaseMock([membership]);
    const result = await resolveGameClubId(
      supabase as never,
      'user-1',
      'club-1',
    );
    expect(result).toBe(expected);
    expect(supabase.__fromCalls).toContainEqual({ table: 'group_members', method: 'eq', args: ['user_id', 'user-1'] });
  });

  it('tom streng → null uten DB-kall', async () => {
    const supabase = buildSupabaseMock([]);
    const result = await resolveGameClubId(
      supabase as never,
      'user-1',
      '',
    );
    expect(result).toBeNull();
    expect(supabase.__fromCalls).toHaveLength(0);
  });
});
