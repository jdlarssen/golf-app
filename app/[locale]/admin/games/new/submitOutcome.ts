/**
 * Audit 20.11 (p11): how a wizard save came back, so the local draft goes only
 * on a positive success signal.
 *
 * A server action that succeeds redirects. On the client, Next rejects the
 * action's promise with the redirect error and navigates (server-action
 * reducer). A refused save returns `{ error }`. Anything else thrown (a crash,
 * no network, a redirect to the login page) is a failure, and the draft must
 * stay.
 */
import { routing } from '@/i18n/routing';
import { safeInternalPath } from '@/lib/url/safeInternalPath';

/**
 * Where the create action sends a saved game (`new/actions.ts`): the receipt,
 * game-home, the players page, the admin game page, or the cup. Each is one
 * id segment and an optional page. Re-review: an expired session redirects to
 * `/login`, which is no success, so only these count.
 */
const SUCCESS_PATHS = [
  /^\/games\/[^/]+(\/(klar|spillere))?$/,
  /^\/admin\/games\/[^/]+$/,
  /^\/admin\/cup\/[^/]+$/,
];

/**
 * The target of the error `redirect()` throws, or null for any other error.
 * Next has no public check for it, so this reads the digest it sets:
 * `NEXT_REDIRECT;<type>;<url>;<status>;` (the url may hold `;`).
 */
function redirectTarget(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return null;
  const digest = (error as { digest: unknown }).digest;
  if (typeof digest !== 'string' || !digest.startsWith('NEXT_REDIRECT;')) return null;
  return digest.split(';').slice(2, -2).join(';');
}

/** A redirect to one of the success targets, with or without a locale prefix. */
export function isSuccessRedirect(error: unknown): boolean {
  const target = safeInternalPath(redirectTarget(error));
  if (target === null) return false;
  let path = target.split(/[?#]/)[0];
  for (const locale of routing.locales) {
    if (locale !== routing.defaultLocale && (path === `/${locale}` || path.startsWith(`/${locale}/`))) {
      path = path.slice(locale.length + 1) || '/';
      break;
    }
  }
  return SUCCESS_PATHS.some((re) => re.test(path));
}

/**
 * Runs one save and tells `onResult` whether it succeeded. The result is
 * returned and a thrown error is thrown on unchanged, so Next still handles
 * the redirect and an error boundary still sees a crash.
 */
export async function settleSubmit<T extends { error?: string }>(
  run: () => Promise<T>,
  onResult: (ok: boolean) => void,
): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (error) {
    onResult(isSuccessRedirect(error));
    throw error;
  }
  onResult(!result.error);
  return result;
}
