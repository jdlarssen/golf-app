import { describe, it, expect } from 'vitest';
import { deleteBlockMessageKey } from './deleteBlockMessage';

/**
 * Type A: the admin player page reads the same delete rule as the delete page
 * (audit 2026-11-20). A player who has played has no block of their own — the
 * delete flow anonymises them — so `null` from the shared check shows the link.
 */
describe('deleteBlockMessageKey', () => {
  it.each([
    [null, null],
    ['admin_account', 'deleteBlockAdmin'],
    ['active_engagements', 'errors.target_active'],
    ['sole_club_owner', 'errors.target_sole_club_owner'],
    ['check_failed', 'deleteBlockCheckFailed'],
  ] as const)('outcome %s → %s', (outcome, key) => {
    expect(deleteBlockMessageKey(false, outcome)).toBe(key);
  });

  it('own account → deleteBlockSelf, whatever the check says', () => {
    expect(deleteBlockMessageKey(true, null)).toBe('deleteBlockSelf');
    expect(deleteBlockMessageKey(true, 'admin_account')).toBe('deleteBlockSelf');
  });
});
