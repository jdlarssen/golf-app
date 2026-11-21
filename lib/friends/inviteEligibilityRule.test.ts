/**
 * Trap #4 agreement test (AGENTS.md): who counts as a friend when a roster is
 * filled has two homes, `is_invite_eligible` in the database and
 * `getInviteEligibleIds` in TypeScript. Both count accepted friendships only
 * (migration 0252). Change one without the other and this goes red.
 *
 * What the database does with the rule is proven in
 * `supabase/tests/friend_requests_by_email_test.sql`.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { lastMigrationMatch } from '@/lib/__tests__/migrationCheck';
import { friendIdsFromRows, type FriendshipRow } from './friendGraph';

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf-8');

describe('invite eligibility: accepted friendships only, in both homes', () => {
  it('the last migration defining is_invite_eligible filters friendships on accepted', () => {
    const { match } = lastMigrationMatch(
      /function public\.is_invite_eligible\([\s\S]*?from public\.friendships f\s+where ([\s\S]*?)\)\s+or exists/i,
    );
    expect(match[1]).toMatch(/f\.status = 'accepted'/);
  });

  it('the TypeScript mirror reads friends through getFriendIds, which keeps accepted rows only', () => {
    const source = read('lib/games/inviteEligibility.ts');
    expect(source).toMatch(/getFriendIds\(creatorUserId\)/);
    // The list every picker shows comes from the same reader.
    expect(read('lib/friends/getFriendPlayerOptions.ts')).toMatch(/getFriendIds\(userId\)/);
    expect(read('lib/wizard/getWizardMountData.ts')).toMatch(/getFriendIds\(userId\)/);

    const rows: FriendshipRow[] = [
      { id: '1', requester_id: 'me', addressee_id: 'friend', status: 'accepted' },
      { id: '2', requester_id: 'me', addressee_id: 'asked', status: 'pending' },
      { id: '3', requester_id: 'asker', addressee_id: 'me', status: 'pending' },
    ];
    expect(friendIdsFromRows(rows, 'me')).toEqual(['friend']);
  });
});
