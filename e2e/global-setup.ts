import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { FullConfig } from '@playwright/test';
import {
  assessServerIdentity,
  type LocalIdentity,
  type ServerIdentity,
} from '@/lib/serverIdentity/assess';

/**
 * Stops a run that would otherwise be tested against the wrong server (#1299,
 * level 2 of #1259). Locally `reuseExistingServer` reuses whatever listens on
 * the port — another branch's dev server (#1758), another worktree's (#1259) —
 * and the resulting red looks exactly like a real regression.
 *
 * Probe semantics, deliberately ordering-independent: Playwright 1.60 starts
 * (or reuses) the webServer BEFORE globalSetup, so the reuse case is caught
 * here; if that order ever flips, nothing is listening yet, we skip, and
 * Playwright then boots a correct server anyway. Either way the outcome is
 * right.
 *
 * Fail-closed on anything that answers but does not match; fail-open only when
 * nothing is listening at all.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  // webServer's cwd defaults to the config's directory — that, not this
  // process's cwd, is what the server should be running from. `npx playwright
  // test` from a subdirectory must not read as a worktree mismatch.
  const rootDir = config.configFile ? dirname(config.configFile) : process.cwd();

  const probe = await probeHealth(baseURL);
  if (probe.kind === 'nothing-listening') return;

  if (probe.kind === 'unusable') {
    throw new Error(
      buildFailure(
        baseURL,
        `Something is listening on ${baseURL}, but ${probe.detail}.`,
        'That is an older server without this route, a different app, or a half-dead process.',
      ),
    );
  }

  const local = readLocalIdentity(rootDir);
  const assessment = assessServerIdentity(probe.identity, local);
  if (assessment.match) return;

  throw new Error(
    buildFailure(
      baseURL,
      `The server on ${baseURL} is not this working tree.`,
      assessment.summary,
    ),
  );
}

type ProbeResult =
  | { kind: 'ok'; identity: ServerIdentity }
  | { kind: 'nothing-listening' }
  | { kind: 'unusable'; detail: string };

async function probeHealth(baseURL: string): Promise<ProbeResult> {
  let response: Response;
  try {
    response = await fetch(new URL('/api/health', baseURL), {
      signal: AbortSignal.timeout(3_000),
    });
  } catch (error) {
    // A timeout means something DID accept the connection and then failed to
    // answer — that is a sick server, not an absent one. Every other transport
    // failure (ECONNREFUSED and friends) means no server yet: skip, and let
    // Playwright boot its own.
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { kind: 'unusable', detail: 'it did not answer /api/health within 3s' };
    }
    return { kind: 'nothing-listening' };
  }

  if (!response.ok) {
    return {
      kind: 'unusable',
      detail: `/api/health answered ${response.status}`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: 'unusable', detail: '/api/health did not answer with JSON' };
  }

  if (!isServerIdentity(payload)) {
    return {
      kind: 'unusable',
      detail: '/api/health answered JSON that is not an identity payload',
    };
  }

  return { kind: 'ok', identity: payload };
}

function isServerIdentity(value: unknown): value is ServerIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.cwd === 'string' &&
    typeof candidate.bootedAt === 'number' &&
    (typeof candidate.sha === 'string' || candidate.sha === null) &&
    (typeof candidate.version === 'string' || candidate.version === null)
  );
}

function readLocalIdentity(rootDir: string): LocalIdentity {
  return {
    cwd: rootDir,
    sha: git(rootDir, ['rev-parse', 'HEAD']),
    headMtimeMs: readHeadMtimeMs(rootDir),
  };
}

function readHeadMtimeMs(rootDir: string): number | null {
  // Checkout touches HEAD; `git fetch` and new commits on the same branch do
  // not. So the only thing this can flag is "server older than the last
  // checkout" — precisely the unsafe state.
  //
  // Asking git for the path rather than hardcoding `.git/HEAD`: in a linked
  // worktree `.git` is a FILE, and the hardcoded path throws ENOTDIR — which is
  // exactly the #1259 setting this check exists for.
  const headPath = git(rootDir, ['rev-parse', '--git-path', 'HEAD']);
  if (headPath === null) return null;
  try {
    return statSync(resolve(rootDir, headPath)).mtimeMs;
  } catch {
    return null;
  }
}

function git(cwd: string, args: string[]): string | null {
  try {
    const out = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 2_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === '' ? null : out;
  } catch {
    return null;
  }
}

function buildFailure(baseURL: string, headline: string, detail: string): string {
  const port = new URL(baseURL).port || '3000';
  return [
    '',
    `Refusing to run the suite: ${headline}`,
    '',
    detail,
    '',
    'Playwright reuses any server already listening on the port, so this run would',
    'have tested code that is not in your working tree. Kill it and re-run:',
    '',
    `  lsof -ti:${port} | xargs -r kill`,
    '  rm -rf .next',
    '  npm run e2e:gate',
    '',
  ].join('\n');
}
