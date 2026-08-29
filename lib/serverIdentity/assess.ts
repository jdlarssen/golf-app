/**
 * Pure comparison half of the dev-server identity check (#1299, level 2 of
 * #1259). The server reports who it is via `/api/health`; the Playwright
 * globalSetup reports what the working tree currently is. This decides whether
 * they are the same thing.
 *
 * Kept pure and dependency-free so the decision table is unit-testable — the
 * globalSetup that calls it does nothing but fetch, stat and throw.
 */

/** What `/api/health` reports about the running server. */
export interface ServerIdentity {
  /** `process.cwd()` of the server process. */
  cwd: string;
  /**
   * Inlined `NEXT_PUBLIC_APP_VERSION`. Diagnostic only — it is re-inlined on
   * recompilation, so it is too weak to fail a run on. Reported, never compared.
   */
  version: string | null;
  /** `git rev-parse HEAD` as of the server's FIRST health call, or null without git. */
  sha: string | null;
  /** Epoch ms of true process boot (`Date.now() - process.uptime() * 1000`). */
  bootedAt: number;
}

/** What the machine running the tests currently looks like. */
export interface LocalIdentity {
  /** Directory the webServer would boot from — the Playwright config's directory. */
  cwd: string;
  /** `git rev-parse HEAD` in the working tree, or null when git is unreadable. */
  sha: string | null;
  /** mtime (epoch ms) of the resolved HEAD file — touched by every checkout. */
  headMtimeMs: number | null;
}

export type IdentityMismatchCode = 'cwd' | 'booted-before-checkout' | 'sha';

export type ServerIdentityAssessment =
  | { match: true }
  | { match: false; code: IdentityMismatchCode; summary: string };

/**
 * Compares a running server against the working tree. Checks run in order of
 * how load-bearing they are, and the first mismatch wins:
 *
 * 1. `cwd` — the server belongs to another worktree (#1259).
 * 2. `bootedAt` vs the last checkout — the server predates the code under test
 *    (#1758). This is the load-bearing check: the server's sha is stashed on
 *    its FIRST health call, which in the worst case is this very probe, taken
 *    after the branch switch — then the sha would match falsely.
 * 3. `sha` — but ONLY as a fallback for a blind leg 2 (#1761).
 *
 * Why leg 3 is conditional. The stash the server compares against is stamped on
 * its first health call and never refreshed, so the two timestamps that matter
 * are the stamp and the last HEAD move — and only leg 2 can see both. A plain
 * `git commit` on a clean tree moves HEAD without touching a single file: the
 * stamp goes stale while the code the server is serving stays byte-identical to
 * the working tree. Firing on sha there is a false red, and a long-running dev
 * server collects one on every commit.
 *
 * When leg 2 CAN see the checkout (`headMtimeMs !== null`) it has already
 * answered the real question — did this server boot before the code it is
 * serving? A sha difference that survives that is a stale stamp, not a stale
 * server. Only when HEAD cannot be stat-ed does the sha become the last signal
 * left, and there it stays fail-closed: the re-run pattern (run 1 stamped on
 * branch A, run 2 probes after switching to B) is caught by leg 2 whenever HEAD
 * is readable, because the checkout that switched branches moved its mtime.
 *
 * Both degrading legs (no readable HEAD mtime, sha missing on either side) are
 * skipped rather than failed: a machine without git must still be able to run
 * the suite.
 */
export function assessServerIdentity(
  server: ServerIdentity,
  local: LocalIdentity,
): ServerIdentityAssessment {
  if (server.cwd !== local.cwd) {
    return {
      match: false,
      code: 'cwd',
      summary: `The server runs from ${server.cwd}, but the tests expect ${local.cwd}.`,
    };
  }

  if (local.headMtimeMs !== null && server.bootedAt < local.headMtimeMs) {
    return {
      match: false,
      code: 'booted-before-checkout',
      summary:
        `The server booted ${asIso(server.bootedAt)}, before the last checkout ` +
        `${asIso(local.headMtimeMs)} — it is serving older code than the working tree.`,
    };
  }

  if (
    local.headMtimeMs === null &&
    server.sha !== null &&
    local.sha !== null &&
    server.sha !== local.sha
  ) {
    return {
      match: false,
      code: 'sha',
      summary: `The server is on commit ${server.sha}, the working tree is on ${local.sha}.`,
    };
  }

  return { match: true };
}

function asIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}
