import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROD_SUPABASE_REF,
  STAGING_SUPABASE_REF,
  scriptTargetRefusal,
  supabaseTargetOf,
  testDatabaseRefusal,
} from '../lib/supabaseTarget';
import { e2eTargetFailure } from '../e2e/_helpers/envGate';

// Audit 20.11 (owner card 63): the tests and the scripts that write with the
// service-role key check which database they are pointed at before the first
// write. Until now only habit kept test data out of production.

const STAGING_URL = `https://${STAGING_SUPABASE_REF}.supabase.co`;
const PROD_URL = `https://${PROD_SUPABASE_REF}.supabase.co`;

describe('supabaseTargetOf', () => {
  it.each([
    [STAGING_URL, 'staging'],
    [`${STAGING_URL}/rest/v1`, 'staging'],
    [PROD_URL, 'prod'],
    [PROD_URL.toUpperCase().replace('HTTPS', 'https'), 'prod'],
    ['http://localhost:54321', 'local'],
    ['http://127.0.0.1:54321', 'local'],
    // The whole host must match — the ref as a substring is not enough.
    [`https://${STAGING_SUPABASE_REF}.supabase.co.example.com`, 'unknown'],
    [`https://example.com/${STAGING_SUPABASE_REF}.supabase.co`, 'unknown'],
    [`https://x${STAGING_SUPABASE_REF}.supabase.co`, 'unknown'],
    ['https://api.tornygolf.no', 'unknown'],
    ['not a url', 'unknown'],
    ['', 'unknown'],
    [undefined, 'unknown'],
  ])('%s → %s', (url, target) => {
    expect(supabaseTargetOf(url)).toBe(target);
  });
});

describe('testDatabaseRefusal', () => {
  it('staging and a local database are fine', () => {
    expect(testDatabaseRefusal(STAGING_URL)).toBeNull();
    expect(testDatabaseRefusal('http://127.0.0.1:54321')).toBeNull();
  });

  it('production is refused, and the message says so', () => {
    expect(testDatabaseRefusal(PROD_URL)).toContain('PRODUCTION');
  });

  it('an unknown database is refused (fail closed)', () => {
    expect(testDatabaseRefusal('https://api.tornygolf.no')).toContain('not the staging database');
    expect(testDatabaseRefusal(undefined)).not.toBeNull();
  });
});

describe('scriptTargetRefusal', () => {
  it('staging without the prod flag runs', () => {
    expect(scriptTargetRefusal({ url: STAGING_URL, wantProd: false })).toBeNull();
  });

  it('production without the prod flag is refused', () => {
    expect(scriptTargetRefusal({ url: PROD_URL, wantProd: false })).toContain('PRODUCTION');
  });

  it('production with the prod flag runs', () => {
    expect(scriptTargetRefusal({ url: PROD_URL, wantProd: true })).toBeNull();
  });

  it('the prod flag against anything but production is refused', () => {
    expect(scriptTargetRefusal({ url: STAGING_URL, wantProd: true })).toContain('not production');
  });

  it('an unknown database is refused with or without the flag', () => {
    expect(scriptTargetRefusal({ url: 'https://api.tornygolf.no', wantProd: false })).not.toBeNull();
    expect(scriptTargetRefusal({ url: 'https://api.tornygolf.no', wantProd: true })).not.toBeNull();
    expect(scriptTargetRefusal({ url: undefined, wantProd: false })).not.toBeNull();
  });
});

describe('e2eTargetFailure', () => {
  it('staging → run', () => {
    expect(e2eTargetFailure({ NEXT_PUBLIC_SUPABASE_URL: STAGING_URL })).toBeNull();
  });

  it('production → refuse, also with the local opt-out', () => {
    const failure = e2eTargetFailure({
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      E2E_ALLOW_ENV_SKIP: '1',
    });
    expect(failure).toContain('PRODUCTION');
    expect(failure).toContain('.env.staging.local');
  });

  it('unknown host → refuse', () => {
    expect(e2eTargetFailure({ NEXT_PUBLIC_SUPABASE_URL: 'https://api.tornygolf.no' })).not.toBeNull();
  });

  it('no URL at all → nothing to refuse here (the env gate reports the gap)', () => {
    expect(e2eTargetFailure({})).toBeNull();
  });
});

// The plain-JS scripts and the shell guards cannot import the TypeScript home, so
// each carries its own copy of a ref. This locks the copies to the home.
describe('the copies of the project refs agree with lib/supabaseTarget.ts', () => {
  const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

  it.each([
    'scripts/dev-login-users.mjs',
    'scripts/provision-review-account.mjs',
    'scripts/clone-cup-to-staging.mjs',
  ])('%s pins the staging ref', (path) => {
    expect(read(path)).toContain(`const STAGING_REF = '${STAGING_SUPABASE_REF}';`);
  });

  it.each(['scripts/provision-review-account.mjs', 'scripts/clone-cup-to-staging.mjs'])(
    '%s pins the prod ref',
    (path) => {
      expect(read(path)).toContain(`const PROD_REF = '${PROD_SUPABASE_REF}';`);
    },
  );

  it.each(['.claude/hooks/bash-guard.sh', '.claude/hooks/mcp-guard.sh'])(
    '%s guards the same prod ref',
    (path) => {
      expect(read(path)).toContain(`PROD_REF="${PROD_SUPABASE_REF}"`);
    },
  );
});

// A script that writes with the service-role key must check its target. The
// list is every file outside the app that builds such a client; a new one fails
// here until it checks the target too.
describe('every service-role script checks its target', () => {
  const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

  it.each([
    ['e2e/_helpers/games.ts', 'testDatabaseRefusal('],
    ['e2e/global-setup.ts', 'e2eTargetFailure('],
    ['scripts/backfillResultSummaries.ts', 'scriptTargetRefusal('],
    ['scripts/provision-review-account.mjs', 'assertTarget('],
    ['scripts/clone-cup-to-staging.mjs', 'assertTarget('],
    ['scripts/dev-login-users.mjs', '${STAGING_REF}.supabase.co'],
  ])('%s', (path, marker) => {
    expect(read(path)).toContain(marker);
  });
});
