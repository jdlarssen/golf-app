import 'server-only';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { clamp, TITLE_MAX, BODY_MAX } from './clampText';

/**
 * Hand-rolled FCM HTTP v1 sender for the Android app (#2758), the apns.ts twin.
 *
 * Why no library: `firebase-admin` is a large dependency for what is a signed
 * JWT, a token exchange and one POST. Node ships everything it needs, so this
 * stays a zero-dependency module.
 *
 * Missing env → `isFcmConfigured()` is false and callers skip the channel (the
 * vapid.ts no-op contract: push is additive, email still reaches the user).
 *
 * Everything that makes a decision — JWT, message, prune — is a pure function;
 * `getFcmAccessToken` and `sendFcmNotification` are the thin IO shell around them.
 */

// The service-account JSON, base64-encoded (the repo is public — the key only
// ever lives in env, never on disk here).
const SERVICE_ACCOUNT_B64 = process.env.FCM_SERVICE_ACCOUNT ?? '';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** Google accepts an assertion for at most one hour. */
const ASSERTION_TTL_S = 3600;

/** Renew this long before expiry, so a send never leaves with a dying token. */
const TOKEN_RENEW_MARGIN_MS = 5 * 60 * 1000;

/** The fan-out waits for every channel: a hung request must not hold it for minutes. */
const REQUEST_TIMEOUT_MS = 10 * 1000;

/** The channel the app creates at startup (#2758 PR 2). */
const ANDROID_CHANNEL_ID = 'varsler';

/** What to do with a token row after a non-2xx FCM response. */
export type FcmPruneAction =
  | 'prune'     // the token is dead — delete the row
  | 'keep-log'; // transient or our fault — keep the row, log it

/** One FCM response, reduced to the two fields any decision depends on. */
export type FcmResult = { status: number; errorCode: string | null };

/** The message without its target: one fan-out sends the same one to every device. */
export type FcmContent = {
  notification: { title: string; body: string };
  data: { url: string; kind: string };
  android: {
    priority: 'HIGH';
    notification: { channel_id: string; sound: string };
  };
};

type ServiceAccount = { projectId: string; clientEmail: string; key: KeyObject };

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Null for anything that is not a usable service account. Never logs the value. */
function parseServiceAccount(encoded: string): ServiceAccount | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    const { type, project_id, client_email, private_key } = parsed as Record<string, unknown>;
    if (
      type !== 'service_account' ||
      !nonEmptyString(project_id) ||
      !nonEmptyString(client_email) ||
      !nonEmptyString(private_key)
    ) {
      return null;
    }
    return { projectId: project_id, clientEmail: client_email, key: createPrivateKey(private_key) };
  } catch {
    return null;
  }
}

let serviceAccount: ServiceAccount | null | undefined;

function getServiceAccount(): ServiceAccount | null {
  if (serviceAccount !== undefined) return serviceAccount;
  serviceAccount = SERVICE_ACCOUNT_B64 ? parseServiceAccount(SERVICE_ACCOUNT_B64) : null;
  if (SERVICE_ACCOUNT_B64 && !serviceAccount) {
    console.error('[push] FCM_SERVICE_ACCOUNT is set, but is not a usable service account');
  }
  return serviceAccount;
}

/** True when a usable service account is present. When false, callers must skip FCM. */
export function isFcmConfigured(): boolean {
  return getServiceAccount() !== null;
}

function requireServiceAccount(): ServiceAccount {
  const account = getServiceAccount();
  if (!account) throw new Error('FCM is not configured');
  return account;
}

/** Build the RS256 assertion Google swaps for an access token. */
export function buildFcmJwt(): string {
  const account = requireServiceAccount();
  const iat = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: FCM_SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + ASSERTION_TTL_S,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(signingInput, 'utf8'), account.key);

  return `${signingInput}.${signature.toString('base64url')}`;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let pendingToken: Promise<string> | null = null;

async function exchangeAssertion(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: GRANT_TYPE, assertion: buildFcmJwt() }).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => null)) as {
    access_token?: unknown;
    expires_in?: unknown;
  } | null;
  if (!res.ok || !nonEmptyString(body?.access_token) || typeof body?.expires_in !== 'number') {
    throw new Error(`FCM token exchange failed with status ${res.status}`);
  }
  cachedToken = {
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

/**
 * Get (or reuse) the access token every send carries. The sends of one fan-out
 * start together, so they share one exchange instead of racing for a token each.
 */
export function getFcmAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_RENEW_MARGIN_MS > Date.now()) {
    return Promise.resolve(cachedToken.token);
  }
  pendingToken ??= exchangeAssertion().finally(() => {
    pendingToken = null;
  });
  return pendingToken;
}

/**
 * Build the notification. Same clamp limits as the other two channels, so they
 * show identical text, and far below FCM's 4 KB payload ceiling. Every `data`
 * value must be a string: FCM rejects anything else.
 */
export function buildFcmMessage(
  title: string,
  detail: string,
  url: string,
  kind: string,
): FcmContent {
  return {
    notification: { title: clamp(title, TITLE_MAX), body: clamp(detail, BODY_MAX) },
    data: { url, kind },
    android: {
      priority: 'HIGH',
      notification: { channel_id: ANDROID_CHANNEL_ID, sound: 'default' },
    },
  };
}

/**
 * Decide what a failed send means for the stored token row.
 *
 * Only `404 UNREGISTERED` means the token is dead. A 404 without the code is a
 * wrong URL or project id, which says nothing about the token: pruning on it
 * would wipe every Android device. Anything else (auth trouble, quota, FCM
 * outages, a malformed request) is ours or transient: keep the row and log.
 */
export function decideFcmPruneAction(status: number, errorCode: string | null): FcmPruneAction {
  return status === 404 && errorCode === 'UNREGISTERED' ? 'prune' : 'keep-log';
}

/**
 * FCM error bodies carry the code in a detail:
 * `{"error":{"details":[{"@type":"…/google.firebase.fcm.v1.FcmError","errorCode":"UNREGISTERED"}]}}`.
 * The top-level `status` is the gRPC one (`NOT_FOUND`), not the FCM code.
 */
export function parseFcmErrorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { details?: unknown } } | null;
    const details = parsed?.error?.details;
    if (!Array.isArray(details)) return null;
    for (const detail of details as Array<Record<string, unknown>>) {
      if (
        typeof detail['@type'] === 'string' &&
        detail['@type'].endsWith('/google.firebase.fcm.v1.FcmError') &&
        typeof detail.errorCode === 'string'
      ) {
        return detail.errorCode;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * POST one notification to FCM and report the status + error code.
 *
 * Deliberately decision-free — it never throws for an FCM-level rejection, it
 * reports it, and `decideFcmPruneAction` interprets it. A failed token exchange
 * or a network error does throw: neither says anything about the device token.
 *
 * `token` is marked deprecated in favour of `fid` (read 2026-11-02, no removal
 * date), but it is what the app gets from `getDevicePushTokenAsync`.
 */
export async function sendFcmNotification(
  deviceToken: string,
  content: FcmContent,
): Promise<FcmResult> {
  const { projectId } = requireServiceAccount();
  const accessToken = await getFcmAccessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ message: { token: deviceToken, ...content } }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await res.text();
  return { status: res.status, errorCode: res.ok ? null : parseFcmErrorCode(body) };
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}
