/**
 * Audit 20.11 (p11): how a wizard save came back, so the local draft goes only
 * on a positive success signal.
 *
 * A server action that succeeds redirects. On the client, Next rejects the
 * action's promise with the redirect error and navigates (server-action
 * reducer). A refused save returns `{ error }`. Anything else thrown (a crash,
 * no network) is a failure, and the draft must stay.
 */

/**
 * The error `redirect()` throws. Next has no public check for it, so this
 * reads the digest it sets: `NEXT_REDIRECT;<type>;<url>;<status>;`.
 */
export function isNextRedirect(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return false;
  const digest = (error as { digest: unknown }).digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT;');
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
    onResult(isNextRedirect(error));
    throw error;
  }
  onResult(!result.error);
  return result;
}
