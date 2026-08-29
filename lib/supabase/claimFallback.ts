import { expectOne } from './affectedRows'

/**
 * #1790 — shared 42501-fallback for the two push-registration actions
 * (registerApnsToken / savePushSubscription).
 *
 * The ordinary upsert on a globally unique device identity (apns token /
 * web-push endpoint) is refused by the own-rows RLS when the existing row
 * belongs to ANOTHER account — the account-switch-on-same-device case. That
 * refusal is deliberate (it blocks takeover through the normal write path);
 * the recovery is the possession-gated claim RPC from migration 0167, which
 * hands the row over because presenting the exact unguessable value proves
 * the caller holds the device.
 *
 * Every other outcome keeps today's semantics: success is asserted with
 * `expectOne` (0-row upserts stay loud, #667/#704), and non-42501 errors
 * throw exactly as before. `expectOne` discards `PostgrestError.code`, so the
 * 42501 check reads the RAW result first — the shared helper itself is
 * unchanged (many call-sites, out of scope for #1790).
 */
export async function expectOneOrClaim<T>(
  result: { data: T[] | null; error: { message: string; code?: string } | null },
  context: string,
  // PromiseLike, not Promise: the supabase rpc() builder is a thenable.
  claim: () => PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  if (result.error?.code === '42501') {
    const { error } = await claim()
    if (error) {
      throw new Error(`${context}: claim failed: ${error.message}`)
    }
    return
  }
  expectOne(result, context)
}
