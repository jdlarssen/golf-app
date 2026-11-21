/**
 * Which Supabase project does a URL point at?
 *
 * The one home for the two project refs outside the app itself. The e2e suite
 * and the maintenance scripts write with the service-role key, which bypasses
 * every access rule — so before the first write they ask this module where
 * they are pointed, and refuse anything that is not the database they expect.
 *
 * The whole host must match. A ref that only appears somewhere in the URL does
 * not count, and a host we do not know is never treated as safe.
 *
 * Plain TS on purpose (no `@/` alias, no imports): Playwright, tsx scripts and
 * vitest all load it. The plain-JS scripts and the shell guards carry their own
 * copy of a ref; `tests/supabaseTarget.test.ts` locks the copies to this file.
 */

export const PROD_SUPABASE_REF = 'glofubopddkjhymcbaph';
export const STAGING_SUPABASE_REF = 'snwmueecmfqqdurxedxv';

export type SupabaseTarget = 'prod' | 'staging' | 'local' | 'unknown';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function supabaseTargetOf(url: string | null | undefined): SupabaseTarget {
  if (!url) return 'unknown';
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
  if (host === `${PROD_SUPABASE_REF}.supabase.co`) return 'prod';
  if (host === `${STAGING_SUPABASE_REF}.supabase.co`) return 'staging';
  if (LOCAL_HOSTS.has(host)) return 'local';
  return 'unknown';
}

function describeUrl(url: string | null | undefined): string {
  if (!url) return '(not set)';
  try {
    return new URL(url).host;
  } catch {
    return '(not a URL)';
  }
}

/**
 * For tests and test tooling: `null` when the URL is the staging database or a
 * local one, otherwise the reason to stop.
 */
export function testDatabaseRefusal(url: string | null | undefined): string | null {
  const target = supabaseTargetOf(url);
  if (target === 'staging' || target === 'local') return null;
  if (target === 'prod') {
    return `NEXT_PUBLIC_SUPABASE_URL points at PRODUCTION (${describeUrl(url)}). Tests create and delete rows with the service-role key and only ever run against staging (${STAGING_SUPABASE_REF}).`;
  }
  return `NEXT_PUBLIC_SUPABASE_URL (${describeUrl(url)}) is not the staging database (${STAGING_SUPABASE_REF}) or a local one. Tests refuse a database they do not know.`;
}

/**
 * For maintenance scripts that can run against either database: `null` when
 * the URL matches what the caller asked for, otherwise the reason to stop.
 * Production needs the explicit flag; the flag against anything else is a
 * mistake; an unknown host is never written to.
 */
export function scriptTargetRefusal({
  url,
  wantProd,
}: {
  url: string | null | undefined;
  wantProd: boolean;
}): string | null {
  const target = supabaseTargetOf(url);
  if (target === 'unknown') {
    return `NEXT_PUBLIC_SUPABASE_URL (${describeUrl(url)}) is neither staging (${STAGING_SUPABASE_REF}) nor production. Refusing to write to a database this script does not know.`;
  }
  if (wantProd) {
    return target === 'prod'
      ? null
      : `--prod was given, but NEXT_PUBLIC_SUPABASE_URL (${describeUrl(url)}) is not production. Refusing: the flag and the environment disagree.`;
  }
  if (target === 'prod') {
    return `NEXT_PUBLIC_SUPABASE_URL points at PRODUCTION (${describeUrl(url)}). Run against staging first (.env.staging.local). A production run needs the owner's approval in the session and the --prod flag.`;
  }
  return null;
}
