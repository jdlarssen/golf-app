/**
 * Env gate for the authenticated e2e specs (#2226).
 *
 * Every authenticated @gate spec runs `test.skip(!envReady, …)`. Without a
 * gate, one missing secret skips the whole core-flow suite and Playwright
 * still exits 0 — the required `e2e` check goes green without having run
 * anything that logs in. `e2e/global-setup.ts` calls `e2eEnvGateFailure`
 * before the first spec and refuses the run instead.
 *
 * Plain TS on purpose — no Playwright import, no `@/` alias — so the helper,
 * global setup and the vitest unit test (`tests/e2eEnvGate.test.ts`) can all
 * import it.
 */

// Not NodeJS.ProcessEnv: Next's global types make NODE_ENV required there.
// process.env is still assignable to this.
type E2eEnv = Readonly<Record<string, string | undefined>>;

type Requirement = {
  name: string;
  reason: string;
  read: (env: E2eEnv) => string | undefined;
};

// Order matters: missingE2eEnvReason reports the first gap, as the old
// skipReason chain in games.ts did. The mails are trimmed, so whitespace-only
// counts as missing.
const REQUIREMENTS: readonly Requirement[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    reason: 'NEXT_PUBLIC_SUPABASE_URL ikke satt',
    read: (env) => env.NEXT_PUBLIC_SUPABASE_URL,
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    reason:
      'SUPABASE_SERVICE_ROLE_KEY ikke satt — påkrevet for å hente OTP via admin.generateLink',
    read: (env) => env.SUPABASE_SERVICE_ROLE_KEY,
  },
  {
    name: 'E2E_ADMIN_EMAIL',
    reason:
      'E2E_ADMIN_EMAIL ikke satt — påkrevet for å logge inn admin som oppretter test-spillet',
    read: (env) => env.E2E_ADMIN_EMAIL?.trim(),
  },
  {
    name: 'E2E_PLAYER_EMAIL',
    reason:
      'E2E_PLAYER_EMAIL ikke satt — påkrevet for å logge inn test-spiller som melder seg på',
    read: (env) => env.E2E_PLAYER_EMAIL?.trim(),
  },
];

function missingRequirements(env: E2eEnv): Requirement[] {
  return REQUIREMENTS.filter((requirement) => !requirement.read(env));
}

/** `''` when all four are set, otherwise the skip reason for the first gap. */
export function missingE2eEnvReason(env: E2eEnv): string {
  return missingRequirements(env)[0]?.reason ?? '';
}

/**
 * `null` = run. A string = refuse the run with that message.
 *
 * Locally, `E2E_ALLOW_ENV_SKIP=1` lets a developer run the public specs on
 * purpose. CI ignores it: there the gate must never pass on skipped specs.
 */
export function e2eEnvGateFailure(env: E2eEnv): string | null {
  const missing = missingRequirements(env);
  if (missing.length === 0) return null;

  const inCi = Boolean(env.CI);
  if (!inCi && env.E2E_ALLOW_ENV_SKIP === '1') return null;

  const names = missing.map((requirement) => requirement.name).join(', ');
  return [
    '',
    `Refusing to run the suite: ${names} not set.`,
    '',
    'Every authenticated spec would skip itself and Playwright would still exit 0,',
    'so the gate could go green without running the core flows (#2226).',
    '',
    ...(inCi
      ? ['In CI: check the repository secrets the e2e job maps into its env.', '']
      : []),
    'Locally: load the staging env into this shell and re-run:',
    '',
    '  set -a && source .env.staging.local && set +a',
    '',
    'A deliberate partial local run (public specs only, never staging evidence):',
    '',
    '  E2E_ALLOW_ENV_SKIP=1 npm run e2e:gate',
    '',
    'E2E_ALLOW_ENV_SKIP has no effect in CI.',
    '',
  ].join('\n');
}
