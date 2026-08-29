import { describe, it, expect } from 'vitest';
import {
  assessServerIdentity,
  type LocalIdentity,
  type ServerIdentity,
} from './assess';

// Type-A unit tests for the dev-server identity decision table (#1299). The
// whole point of the check is to fail a run loudly rather than let a stale
// server answer for code that is not in the working tree, so both directions
// matter: every mismatch must fire, and every degraded input must NOT.

const CHECKOUT_AT = Date.UTC(2026, 7, 28, 10, 0, 0);
const SHA = '1111111111111111111111111111111111111111';

function server(overrides: Partial<ServerIdentity> = {}): ServerIdentity {
  return {
    cwd: '/home/user/golf-app',
    version: '1.234.0',
    sha: SHA,
    // Booted a minute after the last checkout — the healthy case.
    bootedAt: CHECKOUT_AT + 60_000,
    ...overrides,
  };
}

function local(overrides: Partial<LocalIdentity> = {}): LocalIdentity {
  return {
    cwd: '/home/user/golf-app',
    sha: SHA,
    headMtimeMs: CHECKOUT_AT,
    ...overrides,
  };
}

describe('assessServerIdentity', () => {
  it('matches when cwd, checkout time and sha all line up', () => {
    expect(assessServerIdentity(server(), local())).toEqual({ match: true });
  });

  it('flags a server running from another worktree', () => {
    const result = assessServerIdentity(
      server({ cwd: '/home/user/golf-app/.claude/worktrees/other' }),
      local(),
    );

    expect(result).toMatchObject({ match: false, code: 'cwd' });
    expect(result).not.toHaveProperty('match', true);
    if (result.match) throw new Error('expected a mismatch');
    expect(result.summary).toContain('/home/user/golf-app/.claude/worktrees/other');
    expect(result.summary).toContain('/home/user/golf-app');
  });

  it('flags a server that booted before the last checkout', () => {
    const result = assessServerIdentity(
      server({ bootedAt: CHECKOUT_AT - 1 }),
      local(),
    );

    expect(result).toMatchObject({ match: false, code: 'booted-before-checkout' });
    if (result.match) throw new Error('expected a mismatch');
    expect(result.summary).toContain(new Date(CHECKOUT_AT - 1).toISOString());
    expect(result.summary).toContain(new Date(CHECKOUT_AT).toISOString());
  });

  it('treats a server booted exactly at checkout time as fresh', () => {
    // Boundary: only strictly-older is stale. Equal timestamps happen when the
    // checkout and the boot land in the same millisecond.
    expect(
      assessServerIdentity(server({ bootedAt: CHECKOUT_AT }), local()),
    ).toEqual({ match: true });
  });

  it('accepts a sha difference when HEAD is readable and the boot is newer', () => {
    // #1761: the server stamps its sha on its FIRST health call, which may be
    // long before this probe. A `git commit` on a clean tree moves HEAD without
    // changing a single file, so the stamp goes stale while the code the server
    // is serving stays byte-identical to the working tree. With a readable HEAD
    // mtime the checkout leg above has already answered the real question, so a
    // sha difference here is a stale stamp — not a stale server.
    const otherSha = '2222222222222222222222222222222222222222';

    expect(assessServerIdentity(server({ sha: otherSha }), local())).toEqual({
      match: true,
    });
  });

  it('accepts a sha difference at the boundary bootedAt === headMtimeMs', () => {
    // Same boundary as the checkout leg: equal timestamps are fresh, so the sha
    // leg must not fire behind it either.
    const otherSha = '2222222222222222222222222222222222222222';

    expect(
      assessServerIdentity(server({ sha: otherSha, bootedAt: CHECKOUT_AT }), local()),
    ).toEqual({ match: true });
  });

  it('reports cwd first when several checks would fire', () => {
    // Precedence keeps the message about the most actionable cause.
    expect(
      assessServerIdentity(
        server({
          cwd: '/elsewhere',
          bootedAt: CHECKOUT_AT - 1,
          sha: '3333333333333333333333333333333333333333',
        }),
        local(),
      ),
    ).toMatchObject({ match: false, code: 'cwd' });
  });

  it('reports the checkout leg before the sha leg', () => {
    expect(
      assessServerIdentity(
        server({
          bootedAt: CHECKOUT_AT - 1,
          sha: '3333333333333333333333333333333333333333',
        }),
        local(),
      ),
    ).toMatchObject({ match: false, code: 'booted-before-checkout' });
  });

  describe('degrades instead of failing when a signal is unavailable', () => {
    it.each([
      ['the server has no sha (no git in its environment)', server({ sha: null }), local()],
      ['the working tree has no sha', server(), local({ sha: null })],
      ['neither side has a sha', server({ sha: null }), local({ sha: null })],
    ])('skips the sha leg when %s', (_label, serverIdentity, localIdentity) => {
      expect(assessServerIdentity(serverIdentity, localIdentity)).toEqual({
        match: true,
      });
    });

    it('skips the checkout leg when HEAD could not be stat-ed', () => {
      expect(
        assessServerIdentity(
          server({ bootedAt: CHECKOUT_AT - 60_000 }),
          local({ headMtimeMs: null }),
        ),
      ).toEqual({ match: true });
    });

    it('still runs the remaining legs when HEAD is unreadable', () => {
      // Degrading one signal must not disable the others.
      expect(
        assessServerIdentity(server({ cwd: '/elsewhere' }), local({ headMtimeMs: null })),
      ).toMatchObject({ match: false, code: 'cwd' });
    });

    it('falls back to the sha leg when HEAD is unreadable', () => {
      // #1761: this is the ONLY surviving reason to fail on sha. Without a HEAD
      // mtime the checkout leg is blind, so the sha is the last signal left —
      // and there it stays fail-closed.
      const otherSha = '4444444444444444444444444444444444444444';
      const result = assessServerIdentity(
        server({ sha: otherSha }),
        local({ headMtimeMs: null }),
      );

      expect(result).toMatchObject({ match: false, code: 'sha' });
      if (result.match) throw new Error('expected a mismatch');
      expect(result.summary).toContain(otherSha);
      expect(result.summary).toContain(SHA);
    });
  });

  it('ignores version drift — it re-inlines on recompilation', () => {
    expect(
      assessServerIdentity(server({ version: '0.0.1' }), local()),
    ).toEqual({ match: true });
  });
});
