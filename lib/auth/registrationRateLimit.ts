import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Fixed-window rate-limit for selv-påmeldings-actions (#199 §5.10).
 *
 * Tre buckets gjennom `consume_admin_rate_limit`-RPC:
 *   - `selfreg:user:<userId>`  → 5 påmeldinger / 24t per autentisert bruker
 *   - `selfreg:ip:<ip>`        → 10 påmeldinger / 24t per IP
 *   - `selfreg:game:<gameId>`  → 50 påmeldinger / 24t per enkelt-spill
 *
 * Per-bruker fanger naturlig retry-spam. Per-IP fanger NAT-delte attackers
 * uten å strupe ekte familier. Per-spill stopper noen fra å hamre på én
 * spesifikk lenke (oppdaget short_id) — selv om de roterer kontoer og IP.
 *
 * Mønster speiles fra `lib/auth/loginRateLimit.ts`:
 *   - Service-role admin-client fordi RPC-en er gated til service_role.
 *   - Fail-open ved DB-error (transient outage skal ikke låse hele flyten).
 *   - Returnerer `{ ok: true } | { ok: false, error: 'rate_limited' }` —
 *     ingen lekkasje av hvilken bucket som tripped (caller fyrer samme
 *     vennlige feilmelding uansett).
 *
 * Vi har bevisst valgt en SINGLE error-tag («rate_limited») i stedet for
 * per-bucket-tag — abusers skal ikke kunne probere seg fram til hvilken
 * grense som er nådd, og bruker-UX har ingen nytte av å vite om det er
 * IP-en eller spillet som er problemet.
 */
export type RegistrationRateLimitResult =
  | { ok: true }
  | { ok: false; error: 'rate_limited' };

export async function consumeRegistrationRateLimit(opts: {
  userId: string;
  ip: string;
  gameId: string;
  /** Max påmeldinger per bruker per vindu. Default 5. */
  userMax?: number;
  /** Max påmeldinger per IP per vindu. Default 10. */
  ipMax?: number;
  /** Max påmeldinger per spill per vindu. Default 50. */
  gameMax?: number;
  /** Vinduslengde i sekunder. Default 24 timer. */
  windowSeconds?: number;
}): Promise<RegistrationRateLimitResult> {
  const {
    userId,
    ip,
    gameId,
    userMax = 5,
    ipMax = 10,
    gameMax = 50,
    windowSeconds = 24 * 60 * 60,
  } = opts;

  const admin = getAdminClient();

  try {
    const [userRes, ipRes, gameRes] = await Promise.all([
      admin.rpc('consume_admin_rate_limit', {
        p_bucket: `selfreg:user:${userId}`,
        p_max: userMax,
        p_window_seconds: windowSeconds,
      }),
      admin.rpc('consume_admin_rate_limit', {
        p_bucket: `selfreg:ip:${ip}`,
        p_max: ipMax,
        p_window_seconds: windowSeconds,
      }),
      admin.rpc('consume_admin_rate_limit', {
        p_bucket: `selfreg:game:${gameId}`,
        p_max: gameMax,
        p_window_seconds: windowSeconds,
      }),
    ]);

    if (userRes.error || ipRes.error || gameRes.error) {
      console.error('[registrationRateLimit] consume failed', {
        userError: userRes.error?.message,
        ipError: ipRes.error?.message,
        gameError: gameRes.error?.message,
      });
      return { ok: true };
    }

    if (userRes.data !== true || ipRes.data !== true || gameRes.data !== true) {
      return { ok: false, error: 'rate_limited' };
    }
    return { ok: true };
  } catch (err) {
    console.error('[registrationRateLimit] consume threw', err);
    return { ok: true };
  }
}
