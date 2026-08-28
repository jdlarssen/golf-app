import { execFileSync } from 'node:child_process';
import type { ServerIdentity } from './assess';

/**
 * Capture half of the dev-server identity check (#1299). Answers "which
 * checkout, which commit, and since when" for the process serving the request.
 *
 * Two patterns here are new to this repo, both deliberate and both confined to
 * this file:
 *
 * 1. `execFileSync` in lib code. The commit is not available any other way at
 *    runtime — `NEXT_PUBLIC_APP_SHA` is only populated by Vercel, and this
 *    route exists precisely for the environments Vercel never touches. It runs
 *    once per process and never in production (the route 404s there).
 * 2. A `globalThis` stash. Turbopack re-evaluates modules on recompilation, so
 *    module scope is not process scope; stashing on `globalThis` is what makes
 *    the sha survive as "the commit this server was started against" rather
 *    than "the commit at the time of the last recompile". Without it the sha
 *    silently becomes a second copy of the current HEAD and stops catching the
 *    re-run pattern.
 *
 * Known residual hole (accepted): if Next serves handlers from a respawned
 * worker, `process.uptime()` and the stash are per worker, so a stale server
 * can look fresh. That fails OPEN — never a false red — and the check makes the
 * trap improbable, not impossible.
 */

const shaStash = globalThis as typeof globalThis & {
  __tornyServerIdentitySha?: { value: string | null };
};

export function captureServerIdentity(): ServerIdentity {
  return {
    cwd: process.cwd(),
    // Compile-time inline from package.json (next.config.ts `env`), not a
    // runtime value — weak by construction, so it is reported, not compared.
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    sha: resolveStashedSha(),
    // True process boot, independent of when this module was last evaluated.
    bootedAt: Math.round(Date.now() - process.uptime() * 1000),
  };
}

function resolveStashedSha(): string | null {
  const stashed = shaStash.__tornyServerIdentitySha;
  if (stashed) return stashed.value;

  const value = readHeadSha();
  shaStash.__tornyServerIdentitySha = { value };
  return value;
}

function readHeadSha(): string | null {
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      // Never let a git prompt or a slow filesystem hang a request.
      timeout: 2_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return sha === '' ? null : sha;
  } catch {
    // No git, no repo, git too slow: the check degrades to cwd + boot time.
    return null;
  }
}
