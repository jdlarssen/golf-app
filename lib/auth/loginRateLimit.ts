import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Fixed-window rate-limit for the `/login` OTP send-code action.
 *
 * Calls `consume_admin_rate_limit` RPC twice — once for the
 * `login:email:<email>` bucket and once for `login:ip:<ip>`. The RPC is
 * generic (bucket is any string); the name is historical. Both buckets
 * must pass for the action to proceed.
 *
 * Why a service-role client: the RPC is owned by `service_role`. Anon /
 * unauthenticated callers (which is what a pre-login visitor is) don't have
 * EXECUTE grant without extra plumbing. Service-role call from a server
 * action is safe — the bucket key is the only attacker-influenced input
 * and is treated as opaque text by the RPC.
 *
 * Defaults reflect self-registration abuse threat model rather than admin
 * invite spam (which is more permissive). Per-email cap dominates for
 * typo + retry; per-IP cap covers shared NAT (households) without
 * punishing legit traffic, but stops single-source spray attacks.
 *
 * Returns `{ ok: true }` when both buckets allow, otherwise `{ ok: false,
 * reason }` indicating which bucket tripped. Callers map both reasons to
 * the same user-facing `rate_limited` error to avoid leaking bucket
 * details to attackers.
 *
 * Fail-open on database errors: a transient outage on
 * `admin_action_rate_limit` should not lock everyone out of the login
 * flow. Logged via `console.error` so the issue surfaces in Vercel logs.
 */
export async function consumeLoginRateLimit(opts: {
  email: string;
  ip: string;
  /** Max sendCode attempts per email per window. Default 3. */
  emailMax?: number;
  /** Max sendCode attempts per IP per window. Default 10. */
  ipMax?: number;
  /** Window length in seconds. Default 15 minutes. */
  windowSeconds?: number;
}): Promise<{ ok: true } | { ok: false; reason: 'email' | 'ip' }> {
  const {
    email,
    ip,
    emailMax = 3,
    ipMax = 10,
    windowSeconds = 15 * 60,
  } = opts;

  const admin = getAdminClient();

  try {
    const [emailRes, ipRes] = await Promise.all([
      admin.rpc('consume_admin_rate_limit', {
        p_bucket: `login:email:${email.toLowerCase()}`,
        p_max: emailMax,
        p_window_seconds: windowSeconds,
      }),
      admin.rpc('consume_admin_rate_limit', {
        p_bucket: `login:ip:${ip}`,
        p_max: ipMax,
        p_window_seconds: windowSeconds,
      }),
    ]);

    if (emailRes.error || ipRes.error) {
      console.error('[loginRateLimit] consume failed', {
        emailError: emailRes.error?.message,
        ipError: ipRes.error?.message,
      });
      return { ok: true };
    }

    if (emailRes.data !== true) return { ok: false, reason: 'email' };
    if (ipRes.data !== true) return { ok: false, reason: 'ip' };
    return { ok: true };
  } catch (err) {
    console.error('[loginRateLimit] consume threw', err);
    return { ok: true };
  }
}
