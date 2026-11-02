import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPairSync, verify } from 'node:crypto';

/**
 * Type A tests for the hand-rolled FCM sender (#2758).
 *
 * The module reads its env at import time (the apns.ts pattern), so every case
 * re-imports through `loadFcm()` after setting env. That also gives each case a
 * fresh token cache. `fetch` is the system boundary and the only mock.
 */

// A throwaway RSA key stands in for the real service account: the public half
// verifies the JWT signature for real instead of asserting on its shape.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'torny-test',
  client_email: 'sender@example.test',
  private_key: PRIVATE_PEM,
};

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://fcm.googleapis.com/v1/projects/torny-test/messages:send';
const START = new Date('2026-11-02T10:00:00Z').getTime();
const MINUTE = 60 * 1000;

const encode = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value), 'utf8').toString('base64');

async function loadFcm(value: string = encode(SERVICE_ACCOUNT)) {
  vi.resetModules();
  if (value === '') delete process.env.FCM_SERVICE_ACCOUNT;
  else process.env.FCM_SERVICE_ACCOUNT = value;
  return import('./fcm');
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

const fetchMock = vi.fn();

const tokenResponse = (accessToken = 'access-1') =>
  new Response(
    JSON.stringify({ access_token: accessToken, expires_in: 3600, token_type: 'Bearer' }),
    { status: 200 },
  );

/** Answers the token endpoint with a fresh access token and FCM with `send`. */
function routeFetch(send: () => Response = () => new Response('{"name":"projects/x/messages/1"}')) {
  let exchanges = 0;
  fetchMock.mockImplementation(async (url: string) =>
    url === TOKEN_URL ? tokenResponse(`access-${++exchanges}`) : send(),
  );
}

const callsTo = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url);

const FCM_ERROR = (errorCode: string) =>
  JSON.stringify({
    error: {
      code: 404,
      message: 'Requested entity was not found.',
      status: 'NOT_FOUND',
      details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }],
    },
  });

let savedEnv: string | undefined;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  savedEnv = process.env.FCM_SERVICE_ACCOUNT;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  errorSpy.mockRestore();
  if (savedEnv === undefined) delete process.env.FCM_SERVICE_ACCOUNT;
  else process.env.FCM_SERVICE_ACCOUNT = savedEnv;
});

describe('isFcmConfigured', () => {
  it('is true for a real service account', async () => {
    const { isFcmConfigured } = await loadFcm();
    expect(isFcmConfigured()).toBe(true);
  });

  it('is false without the variable, and that is not an error', async () => {
    const { isFcmConfigured } = await loadFcm('');
    expect(isFcmConfigured()).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', encode('hemmelig-verdi')],
    ['a user credential', encode({ ...SERVICE_ACCOUNT, type: 'authorized_user' })],
    ['no project_id', encode({ ...SERVICE_ACCOUNT, project_id: '' })],
    ['no client_email', encode({ ...SERVICE_ACCOUNT, client_email: undefined })],
    ['no private_key', encode({ ...SERVICE_ACCOUNT, private_key: undefined })],
    ['a broken key', encode({ ...SERVICE_ACCOUNT, private_key: 'hemmelig-verdi' })],
  ])('is false for %s, and says so without showing the value', async (_case, value) => {
    const { isFcmConfigured } = await loadFcm(value);

    expect(isFcmConfigured()).toBe(false);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('hemmelig-verdi');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(value);
  });
});

describe('buildFcmJwt', () => {
  it('signs the assertion Google asks for, verifiable with the public key', async () => {
    vi.setSystemTime(START);
    const { buildFcmJwt } = await loadFcm();

    const [header, claims, signature] = buildFcmJwt().split('.');

    expect(decodeSegment(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const iat = Math.floor(START / 1000);
    expect(decodeSegment(claims)).toEqual({
      iss: SERVICE_ACCOUNT.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600, // Google's maximum, in epoch seconds
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`, 'utf8'),
        publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });
});

describe('buildFcmMessage', () => {
  it('builds the notification, the deeplink data and the Android options', async () => {
    const { buildFcmMessage } = await loadFcm();

    expect(buildFcmMessage('Tittel', 'Detalj', '/games/abc', 'game_finished')).toEqual({
      notification: { title: 'Tittel', body: 'Detalj' },
      data: { url: '/games/abc', kind: 'game_finished' },
      android: {
        priority: 'HIGH',
        notification: { channel_id: 'varsler', sound: 'default' },
      },
    });
  });

  it('clamps title at 120 and body at 240, the same as the other two channels', async () => {
    const { buildFcmMessage } = await loadFcm();

    const { notification } = buildFcmMessage('t'.repeat(300), 'd'.repeat(300), '/', 'product_update');

    expect(notification.title).toHaveLength(120);
    expect(notification.title.endsWith('…')).toBe(true);
    expect(notification.body).toHaveLength(240);
    expect(notification.body.endsWith('…')).toBe(true);
  });

  it('keeps every data value a string, which FCM requires', async () => {
    const { buildFcmMessage } = await loadFcm();

    const { data } = buildFcmMessage('T', 'D', '/games/abc?varsel=1', 'game_finished');

    expect(Object.values(data).every((value) => typeof value === 'string')).toBe(true);
  });
});

describe('decideFcmPruneAction', () => {
  it.each([
    // status, errorCode, expected
    [404, 'UNREGISTERED', 'prune'],
    // A 404 without the code is a wrong URL or project id: nothing about the
    // token, and pruning on it would wipe every Android device.
    [404, null, 'keep-log'],
    [400, 'INVALID_ARGUMENT', 'keep-log'],
    [401, 'THIRD_PARTY_AUTH_ERROR', 'keep-log'],
    [403, 'SENDER_ID_MISMATCH', 'keep-log'],
    [429, 'QUOTA_EXCEEDED', 'keep-log'],
    [500, 'INTERNAL', 'keep-log'],
    [503, 'UNAVAILABLE', 'keep-log'],
    [500, null, 'keep-log'],
    [0, null, 'keep-log'],
  ] as const)('status %i / errorCode %s → %s', async (status, errorCode, expected) => {
    const { decideFcmPruneAction } = await loadFcm();
    expect(decideFcmPruneAction(status, errorCode)).toBe(expected);
  });
});

describe('parseFcmErrorCode', () => {
  it.each([
    ['the FCM detail', FCM_ERROR('UNREGISTERED'), 'UNREGISTERED'],
    [
      'the FCM detail behind another one',
      JSON.stringify({
        error: {
          details: [
            { '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [] },
            { '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'INVALID_ARGUMENT' },
          ],
        },
      }),
      'INVALID_ARGUMENT',
    ],
    ['no details', JSON.stringify({ error: { code: 404, status: 'NOT_FOUND' } }), null],
    [
      'an errorCode on another detail type',
      JSON.stringify({ error: { details: [{ '@type': 'other', errorCode: 'UNREGISTERED' }] } }),
      null,
    ],
    ['a proxy error page', '<html>Bad Gateway</html>', null],
    ['an empty body', '', null],
    ['JSON that is not an object', 'null', null],
  ])('%s', async (_case, body, expected) => {
    const { parseFcmErrorCode } = await loadFcm();
    expect(parseFcmErrorCode(body)).toBe(expected);
  });
});

describe('getFcmAccessToken', () => {
  it('exchanges the assertion as a form post', async () => {
    routeFetch();
    const { getFcmAccessToken } = await loadFcm();

    await expect(getFcmAccessToken()).resolves.toBe('access-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    const form = new URLSearchParams(init.body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(form.get('assertion')?.split('.')).toHaveLength(3);
  });

  it('reuses the token until five minutes before it expires', async () => {
    vi.setSystemTime(START);
    routeFetch();
    const { getFcmAccessToken } = await loadFcm();

    await expect(getFcmAccessToken()).resolves.toBe('access-1');

    vi.setSystemTime(START + 54 * MINUTE); // six minutes left
    await expect(getFcmAccessToken()).resolves.toBe('access-1');
    expect(callsTo(TOKEN_URL)).toHaveLength(1);

    vi.setSystemTime(START + 56 * MINUTE); // four minutes left
    await expect(getFcmAccessToken()).resolves.toBe('access-2');
    expect(callsTo(TOKEN_URL)).toHaveLength(2);
  });

  it('shares one exchange between sends that start together', async () => {
    routeFetch();
    const { getFcmAccessToken } = await loadFcm();

    const tokens = await Promise.all([getFcmAccessToken(), getFcmAccessToken(), getFcmAccessToken()]);

    expect(tokens).toEqual(['access-1', 'access-1', 'access-1']);
    expect(callsTo(TOKEN_URL)).toHaveLength(1);
  });

  it('keeps nothing from a failed exchange, shows no key, and tries again next time', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    );
    const { getFcmAccessToken } = await loadFcm();

    const failure = await getFcmAccessToken().catch((err: Error) => err);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('400');
    expect((failure as Error).message).not.toContain('PRIVATE KEY');

    fetchMock.mockResolvedValueOnce(tokenResponse('access-2'));
    await expect(getFcmAccessToken()).resolves.toBe('access-2');
  });

  it('treats an answer without a token as a failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ token_type: 'Bearer' })));
    const { getFcmAccessToken } = await loadFcm();

    await expect(getFcmAccessToken()).rejects.toThrow();
  });
});

describe('sendFcmNotification', () => {
  it('posts to the project with the bearer token and the device token', async () => {
    routeFetch();
    const { buildFcmMessage, sendFcmNotification } = await loadFcm();
    const content = buildFcmMessage('T', 'D', '/games/abc', 'game_finished');

    await expect(sendFcmNotification('device-token', content)).resolves.toEqual({
      status: 200,
      errorCode: null,
    });

    const [, init] = callsTo(SEND_URL)[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      authorization: 'Bearer access-1',
      'content-type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({ message: { token: 'device-token', ...content } });
  });

  it('reports the status and error code, and never throws for a rejection', async () => {
    routeFetch(() => new Response(FCM_ERROR('UNREGISTERED'), { status: 404 }));
    const { buildFcmMessage, sendFcmNotification } = await loadFcm();

    await expect(
      sendFcmNotification('dead-token', buildFcmMessage('T', 'D', '/', 'game_finished')),
    ).resolves.toEqual({ status: 404, errorCode: 'UNREGISTERED' });
  });

  it('uses one access token across the sends of a fan-out', async () => {
    routeFetch();
    const { buildFcmMessage, sendFcmNotification } = await loadFcm();
    const content = buildFcmMessage('T', 'D', '/', 'game_finished');

    await Promise.all([sendFcmNotification('a', content), sendFcmNotification('b', content)]);

    expect(callsTo(TOKEN_URL)).toHaveLength(1);
    expect(callsTo(SEND_URL)).toHaveLength(2);
  });

  it('gives up on a request after ten seconds, so a hung FCM cannot hold the fan-out', async () => {
    routeFetch();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    const { buildFcmMessage, sendFcmNotification } = await loadFcm();

    await sendFcmNotification('a', buildFcmMessage('T', 'D', '/', 'game_finished'));

    // Both the token exchange and the send.
    expect(timeoutSpy.mock.calls).toEqual([[10_000], [10_000]]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
    timeoutSpy.mockRestore();
  });
});
