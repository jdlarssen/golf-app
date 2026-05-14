import { describe, it, expect } from 'vitest';
import { isSafeToAutoPush } from './blast-radius';

describe('isSafeToAutoPush', () => {
  it('rejects diffs touching lib/scoring/', () => {
    const result = isSafeToAutoPush({
      files: ['lib/scoring/bestBall.ts'],
      linesChanged: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('lib/scoring');
  });

  it('rejects diffs touching supabase/migrations/', () => {
    const result = isSafeToAutoPush({
      files: ['supabase/migrations/0024_new.sql'],
      linesChanged: 5,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects diffs touching proxy.ts', () => {
    expect(isSafeToAutoPush({ files: ['proxy.ts'], linesChanged: 1 }).ok).toBe(false);
  });

  it('rejects diffs touching lib/sync/', () => {
    expect(isSafeToAutoPush({ files: ['lib/sync/worker.ts'], linesChanged: 1 }).ok).toBe(false);
  });

  it('rejects diffs touching more than 1 file', () => {
    const result = isSafeToAutoPush({
      files: ['lib/mail/inviteNotification.ts', 'app/page.tsx'],
      linesChanged: 4,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('1 file');
  });

  it('rejects diffs with more than 10 lines changed', () => {
    const result = isSafeToAutoPush({
      files: ['app/page.tsx'],
      linesChanged: 11,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('10 line');
  });

  it('accepts a 1-file, 5-line change to lib/mail/', () => {
    const result = isSafeToAutoPush({
      files: ['lib/mail/inviteNotification.ts'],
      linesChanged: 5,
    });
    expect(result.ok).toBe(true);
  });

  it('accepts a copy-typo fix in a tsx file', () => {
    expect(isSafeToAutoPush({ files: ['app/games/page.tsx'], linesChanged: 1 }).ok).toBe(true);
  });

  it('rejects sub-paths within a banned directory', () => {
    expect(
      isSafeToAutoPush({ files: ['lib/scoring/nested/foo.ts'], linesChanged: 1 }).ok,
    ).toBe(false);
  });

  it('accepts files adjacent to but not inside a banned directory', () => {
    // `lib/scoring-utils.ts` is NOT inside `lib/scoring/` (no trailing slash match)
    expect(
      isSafeToAutoPush({ files: ['lib/scoring-utils.ts'], linesChanged: 1 }).ok,
    ).toBe(true);
  });

  it('rejects diffs touching app/api/auth/', () => {
    expect(
      isSafeToAutoPush({ files: ['app/api/auth/route.ts'], linesChanged: 1 }).ok,
    ).toBe(false);
  });

  it('rejects diffs touching app/login/', () => {
    expect(
      isSafeToAutoPush({ files: ['app/login/page.tsx'], linesChanged: 1 }).ok,
    ).toBe(false);
  });

  it('rejects exact match on middleware.ts', () => {
    expect(isSafeToAutoPush({ files: ['middleware.ts'], linesChanged: 1 }).ok).toBe(false);
  });

  it('does NOT block neighboring files when banned entry is a bare filename', () => {
    // 'proxy.ts' is in the banlist; 'proxy.test.ts' should NOT be blocked
    expect(
      isSafeToAutoPush({ files: ['proxy.test.ts'], linesChanged: 1 }).ok,
    ).toBe(true);
  });
});
