import { describe, expect, it } from 'vitest';
import {
  e2eEnvGateFailure,
  missingE2eEnvReason,
} from '../e2e/_helpers/envGate';

// #2226: the e2e gate went green with every authenticated spec skipped when
// one secret was missing. This file lives in tests/, not e2e/: vitest excludes
// e2e/**, and Playwright's testDir would pick up a .test.ts there.

const FULL = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://staging.example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  E2E_ADMIN_EMAIL: 'admin@example.test',
  E2E_PLAYER_EMAIL: 'player@example.test',
};

describe('e2eEnvGateFailure', () => {
  it.each([
    { name: 'all four set locally', env: { ...FULL }, refuses: null },
    { name: 'all four set in CI', env: { ...FULL, CI: 'true' }, refuses: null },
    {
      name: 'player mail missing in CI',
      env: { ...FULL, E2E_PLAYER_EMAIL: undefined, CI: 'true' },
      refuses: 'E2E_PLAYER_EMAIL',
    },
    {
      name: 'service role missing in CI, opt-out ignored',
      env: {
        ...FULL,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
        CI: 'true',
        E2E_ALLOW_ENV_SKIP: '1',
      },
      refuses: 'SUPABASE_SERVICE_ROLE_KEY',
    },
    {
      name: 'admin mail only whitespace locally',
      env: { ...FULL, E2E_ADMIN_EMAIL: '   ' },
      refuses: 'E2E_ADMIN_EMAIL',
    },
    {
      name: 'URL missing locally with the opt-out',
      env: {
        ...FULL,
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        E2E_ALLOW_ENV_SKIP: '1',
      },
      refuses: null,
    },
    {
      name: "opt-out spelled 'true' locally",
      env: {
        ...FULL,
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        E2E_ALLOW_ENV_SKIP: 'true',
      },
      refuses: 'NEXT_PUBLIC_SUPABASE_URL',
    },
  ])('$name', ({ env, refuses }) => {
    const failure = e2eEnvGateFailure(env);
    if (refuses === null) {
      expect(failure).toBeNull();
      return;
    }
    expect(failure).toContain(refuses);
    expect(failure).toContain('set -a && source .env.staging.local && set +a');
  });
});

describe('missingE2eEnvReason', () => {
  it.each([
    { env: { ...FULL }, reason: '' },
    {
      env: {},
      reason: 'NEXT_PUBLIC_SUPABASE_URL ikke satt',
    },
    {
      env: { ...FULL, SUPABASE_SERVICE_ROLE_KEY: undefined, E2E_ADMIN_EMAIL: undefined },
      reason:
        'SUPABASE_SERVICE_ROLE_KEY ikke satt — påkrevet for å hente OTP via admin.generateLink',
    },
    {
      env: { ...FULL, E2E_ADMIN_EMAIL: ' ', E2E_PLAYER_EMAIL: undefined },
      reason:
        'E2E_ADMIN_EMAIL ikke satt — påkrevet for å logge inn admin som oppretter test-spillet',
    },
    {
      env: { ...FULL, E2E_PLAYER_EMAIL: '' },
      reason:
        'E2E_PLAYER_EMAIL ikke satt — påkrevet for å logge inn test-spiller som melder seg på',
    },
  ])('gives «$reason»', ({ env, reason }) => {
    expect(missingE2eEnvReason(env)).toBe(reason);
  });
});
