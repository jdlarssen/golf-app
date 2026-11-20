import { describe, expect, it } from 'vitest';
import { canRemoveClubMember } from './memberRemoval';

describe('canRemoveClubMember', () => {
  it.each([
    ['owner', 'owner', true],
    ['owner', 'admin', true],
    ['owner', 'member', true],
    ['admin', 'owner', false],
    ['admin', 'admin', true],
    ['admin', 'member', true],
    ['member', 'owner', false],
    ['member', 'admin', false],
    ['member', 'member', false],
    [null, 'member', false],
    [undefined, 'owner', false],
  ] as const)('caller %s removing %s → %s', (caller, target, expected) => {
    expect(canRemoveClubMember(caller, target)).toBe(expected);
  });
});
