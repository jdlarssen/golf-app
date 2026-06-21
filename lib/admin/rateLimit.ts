import 'server-only';
import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Fixed-window rate-limit check for an admin invitation attempt.
 *
 * Calls the `consume_admin_rate_limit` RPC twice — once for the
 * `invite-admin:<id>` bucket and once for `invite-ip:<ip>`. Both must pass
 * for the action to proceed. The RPC atomically increments the bucket and
 * returns whether the post-increment count is within budget; on a fresh
 * window (last increment older than the configured seconds), the count
 * resets to 1 before the comparison.
 *
 * Defaults are tuned for spam-burst protection — a human inviting a tournament
 * roster of 30 in one sitting fits within both limits; an automated script
 * firing requests as fast as possible gets blocked after the first minute's
 * legitimate burst.
 *
 * Returns `true` when the action is allowed, `false` when either bucket is
 * exhausted. Database errors are logged and resolved as `true` (fail-open)
 * so a transient outage on the rate-limit table doesn't lock the only admin
 * out of their own invite flow.
 */
export async function consumeAdminInviteRateLimit(opts: {
  supabase: SupabaseClient<Database>;
  adminId: string;
  ip: string;
  /** Max attempts per admin per window. Default 20. */
  adminMax?: number;
  /** Max attempts per IP per window. Default 30. */
  ipMax?: number;
  /** Window length in seconds. Default 60. */
  windowSeconds?: number;
}): Promise<boolean> {
  const {
    supabase,
    adminId,
    ip,
    adminMax = 20,
    ipMax = 30,
    windowSeconds = 60,
  } = opts;

  try {
    const [adminRes, ipRes] = await Promise.all([
      supabase.rpc('consume_admin_rate_limit', {
        p_bucket: `invite-admin:${adminId}`,
        p_max: adminMax,
        p_window_seconds: windowSeconds,
      }),
      supabase.rpc('consume_admin_rate_limit', {
        p_bucket: `invite-ip:${ip}`,
        p_max: ipMax,
        p_window_seconds: windowSeconds,
      }),
    ]);

    if (adminRes.error || ipRes.error) {
      console.error('[rateLimit] consume failed', {
        adminError: adminRes.error?.message,
        ipError: ipRes.error?.message,
      });
      return true;
    }

    return adminRes.data === true && ipRes.data === true;
  } catch (err) {
    console.error('[rateLimit] consume threw', err);
    return true;
  }
}

/**
 * Extract the client IP from request headers. On Vercel, `x-forwarded-for`
 * is appended by the edge and the first entry is the real client. Falls
 * back to `x-real-ip` and finally a sentinel — the sentinel routes all
 * uncategorised callers into a shared bucket, which still slows a coordinated
 * attack but won't punish a single misconfigured deploy.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip') ?? 'unknown';
}
