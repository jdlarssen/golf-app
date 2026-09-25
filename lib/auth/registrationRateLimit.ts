import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * Fixed-window rate-limit for selv-påmeldings-actions (#199 §5.10).
 *
 * Tre buckets gjennom `consume_admin_rate_limit`-RPC:
 *   - `selfreg:user:<userId>`  → 20 påmeldinger / 24t per autentisert bruker
 *   - `selfreg:ip:<ip>`        → 150 påmeldinger / 24t per IP
 *   - `selfreg:game:<gameId>`  → 300 påmeldinger / 24t per enkelt-spill
 *
 * Tallene er satt etter klubbskala (#2212: et klubbmesterskap har 80–150
 * deltakere). Per-bruker gir rom for en hel serie pluss noen omforsøk samme
 * kveld, og fanger fortsatt retry-spam. Per-IP tåler hele klubben på
 * klubbhusets wifi, men stopper én kilde som sprayer. Per-spill er to ganger
 * klubbskala og stopper noen fra å hamre på én spesifikk lenke (oppdaget
 * short_id), selv om de roterer kontoer og IP.
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
  /** Max påmeldinger per bruker per vindu. Default 20. */
  userMax?: number;
  /** Max påmeldinger per IP per vindu. Default 150. */
  ipMax?: number;
  /** Max påmeldinger per spill per vindu. Default 300. */
  gameMax?: number;
  /** Vinduslengde i sekunder. Default 24 timer. */
  windowSeconds?: number;
}): Promise<RegistrationRateLimitResult> {
  // CI / test-env bypass: when SELFREG_RATE_LIMIT_DISABLED=true, skip all
  // bucket checks so the shared test player doesn't exhaust its per-user quota
  // after repeated @gate runs against staging. Mirrors the RESEND_STUB_SEND
  // pattern in lib/mail/inviteNotification.ts. Prod never sets this var (#698).
  if (process.env.SELFREG_RATE_LIMIT_DISABLED === 'true') {
    return { ok: true };
  }
  const {
    userId,
    ip,
    gameId,
    userMax = 20,
    ipMax = 150,
    gameMax = 300,
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
