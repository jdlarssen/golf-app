import 'server-only';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { connect } from 'node:http2';
import { clamp, TITLE_MAX, BODY_MAX } from './clampText';

/**
 * Hand-rolled APNs provider for the iOS shell (#1282).
 *
 * Why no library: the maintained Node APNs clients are stagnant (apns2 is a year
 * old, the alternatives eight), while the HTTP/2 API itself is small and stable —
 * an ES256 JWT plus `POST /3/device/<token>`. Node ships everything it needs, so
 * this stays a zero-dependency module.
 *
 * Missing env → `isApnsConfigured()` is false and callers skip push entirely
 * (the vapid.ts no-op contract: push is additive, email still reaches the user).
 *
 * Everything that makes a decision — JWT, payload, prune/retry — is a pure
 * function; `sendApnsNotification` is the thin IO shell around them.
 */

const KEY_ID = process.env.APNS_KEY_ID ?? '';
const TEAM_ID = process.env.APNS_TEAM_ID ?? '';
const BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? '';
// The .p8 file's PEM contents, base64-encoded (the repo is public — the key
// only ever lives in env, never on disk here).
const PRIVATE_KEY_B64 = process.env.APNS_PRIVATE_KEY ?? '';

/**
 * Apple accepts a provider token for 20–60 minutes and rejects a fresh one
 * requested too often. 45 min sits clear of both ends.
 */
const JWT_TTL_MS = 45 * 60 * 1000;

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;

/**
 * Which APNs environment a device token belongs to. Dev builds installed from
 * Xcode get sandbox tokens, TestFlight/App Store builds get production ones,
 * and the client cannot read its own entitlement — so the server learns it.
 */
export type ApnsEnvironment = 'sandbox' | 'production';

/** What to do with a token row after a non-2xx APNs response. */
export type ApnsPruneAction =
  | 'prune'         // the token is dead — delete the row
  | 'retry-sandbox' // wrong environment guess — try the other host
  | 'keep-log';     // transient or our fault — keep the row, log it

/** One APNs response, reduced to the two fields any decision depends on. */
export type ApnsResult = { status: number; reason: string | null };

/** The JSON body APNs expects, with our deeplink fields riding alongside `aps`. */
export type ApnsPayload = {
  aps: { alert: { title: string; body: string }; sound: string };
  url: string;
  kind: string;
};

/** True when APNs env is present. When false, callers must skip push silently. */
export function isApnsConfigured(): boolean {
  return (
    KEY_ID.length > 0 &&
    TEAM_ID.length > 0 &&
    BUNDLE_ID.length > 0 &&
    PRIVATE_KEY_B64.length > 0
  );
}

let privateKey: KeyObject | null = null;

function getPrivateKey(): KeyObject {
  if (!privateKey) {
    privateKey = createPrivateKey(Buffer.from(PRIVATE_KEY_B64, 'base64').toString('utf8'));
  }
  return privateKey;
}

let cachedJwt: { token: string; expiresAt: number } | null = null;

/**
 * Build (or reuse) the ES256 provider token Apple authenticates us with.
 *
 * `dsaEncoding: 'ieee-p1363'` is load-bearing: Node signs ECDSA as DER by
 * default, and JWT requires the raw R||S form — a DER signature is accepted by
 * nothing and fails as `InvalidProviderToken`.
 */
export function buildApnsJwt(): string {
  const now = Date.now();
  if (cachedJwt && cachedJwt.expiresAt > now) return cachedJwt.token;

  const header = base64url(JSON.stringify({ alg: 'ES256', kid: KEY_ID }));
  const claims = base64url(JSON.stringify({ iss: TEAM_ID, iat: Math.floor(now / 1000) }));
  const signingInput = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(signingInput, 'utf8'), {
    key: getPrivateKey(),
    dsaEncoding: 'ieee-p1363',
  });

  const token = `${signingInput}.${signature.toString('base64url')}`;
  cachedJwt = { token, expiresAt: now + JWT_TTL_MS };
  return token;
}

/**
 * Build the notification body. Same clamp limits as web-push so the two channels
 * show identical text, and far below the 4 KB APNs payload ceiling.
 */
export function buildApnsPayload(
  title: string,
  detail: string,
  url: string,
  kind: string,
): ApnsPayload {
  return {
    aps: {
      alert: { title: clamp(title, TITLE_MAX), body: clamp(detail, BODY_MAX) },
      sound: 'default',
    },
    url,
    kind,
  };
}

/**
 * Decide what a failed send means for the stored token row.
 *
 * - `410` is APNs' terminal "this token is gone" (the web-push 404/410 twin).
 * - `400 BadDeviceToken` usually means we guessed the environment wrong, so the
 *   first one earns a retry against the other host; a token rejected by BOTH
 *   environments is genuinely dead.
 * - Anything else (auth trouble, throttling, Apple outages) is ours or
 *   transient: keep the row and log.
 */
export function decidePruneAction(
  status: number,
  reason: string | null | undefined,
  triedBothEnvs: boolean,
): ApnsPruneAction {
  if (status === 410) return 'prune';
  if (status === 400 && reason === 'BadDeviceToken') {
    return triedBothEnvs ? 'prune' : 'retry-sandbox';
  }
  return 'keep-log';
}

/**
 * POST one notification to APNs over HTTP/2 and report the status + reason.
 *
 * Deliberately decision-free — it never throws for an APNs-level rejection, it
 * reports it, and `decidePruneAction` interprets it. One session per call and
 * always closed: this runs serverless, so there is no connection pool to keep
 * warm and a leaked session would outlive the request.
 */
export async function sendApnsNotification(
  deviceToken: string,
  payload: ApnsPayload,
  environment: ApnsEnvironment,
): Promise<ApnsResult> {
  const session = connect(HOSTS[environment]);
  try {
    return await new Promise<ApnsResult>((resolve, reject) => {
      session.once('error', reject);

      const req = session.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${buildApnsJwt()}`,
        'apns-topic': BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });

      let status = 0;
      let body = '';
      req.on('response', (headers) => {
        status = Number(headers[':status'] ?? 0);
      });
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        body += chunk;
      });
      req.on('error', reject);
      req.on('end', () => resolve({ status, reason: parseReason(body) }));

      req.end(JSON.stringify(payload));
    });
  } finally {
    session.close();
  }
}

/** APNs error bodies are `{"reason":"BadDeviceToken"}`; success bodies are empty. */
function parseReason(body: string): string | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    const reason = (parsed as { reason?: unknown }).reason;
    return typeof reason === 'string' ? reason : null;
  } catch {
    return null;
  }
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}
