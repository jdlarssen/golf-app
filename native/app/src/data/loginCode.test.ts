// native/app/src/data/loginCode.test.ts
// #2216: appen ber om innloggingskode gjennom nettsidens rute, og kjører
// stegene etter innloggingen der.
//
// Tre ting testes:
//
//  1. **Hver kode ruta kan svare, kommer fram som samme kode.** Lista er
//     serverens (`SEND_LOGIN_CODE_ERRORS`), så en ny kode der kommer med her av
//     seg selv — og må ha en setning i `loginCopy.ts` for å kompilere.
//  2. **Når appen lander på kode-steget.** Som på nettsiden: ved ok, og ved
//     ett-minutts-sperren, for da ligger det alt en kode i innboksen.
//  3. **`finishLogin` er best-effort.** Den blokkerer aldri innloggingen og
//     kaster aldri, uansett hva ruta svarer.
//  4. **`afterLoginSettled` venter på en pågående `finishLogin`**, men aldri
//     lenger enn taket. Porten foran stacken leser profilen først når
//     invitasjonene er tatt i bruk, så spillet står på Hjem og på kortet.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { SEND_LOGIN_CODE_ERRORS } from '../../../../lib/auth/loginCodeErrors';
import {
  BASE_URL,
  TOKEN,
  auth,
  mockFetch,
  mockNetwork,
  requestInit,
  respondWith,
  useWebRoute,
} from '../test/webRouteHarness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

type LoginCode = typeof import('./loginCode');

function loginCode(): LoginCode {
  return require('./loginCode') as LoginCode;
}

function headers(): Record<string, string> {
  return requestInit().headers as Record<string, string>;
}

describe('requestLoginCode', () => {
  useWebRoute();

  it('200 → ok, med e-posten i kroppen og uten token', async () => {
    // Ingen sesjon: kallet skjer før innloggingen.
    auth().getSession.mockResolvedValue({ data: { session: null } });
    respondWith(200, { ok: true });

    expect(await loginCode().requestLoginCode('ny@example.test')).toEqual({ ok: true });
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/auth/send-code`);
    expect(requestInit().method).toBe('POST');
    expect(requestInit().body).toBe('{"email":"ny@example.test"}');
    expect(headers().Authorization).toBeUndefined();
  });

  it.each([...SEND_LOGIN_CODE_ERRORS])('ruta svarer %s → samme kode', async (code) => {
    respondWith(code.startsWith('rate_limited') ? 429 : 400, { error: code });

    expect(await loginCode().requestLoginCode('spiller@example.test')).toEqual({
      ok: false,
      code,
    });
  });

  it('en kode appen ikke kjenner → unknown', async () => {
    respondWith(400, { error: 'noe_nytt' });

    expect(await loginCode().requestLoginCode('spiller@example.test')).toEqual({
      ok: false,
      code: 'unknown',
    });
  });

  it('500 uten kropp → unknown', async () => {
    respondWith(500, null);

    expect(await loginCode().requestLoginCode('spiller@example.test')).toEqual({
      ok: false,
      code: 'unknown',
    });
  });

  it('uten nett → network, og ingenting sendes', async () => {
    mockNetwork.online = false;

    expect(await loginCode().requestLoginCode('spiller@example.test')).toEqual({
      ok: false,
      code: 'network',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('kallet når ikke fram → network', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(await loginCode().requestLoginCode('spiller@example.test')).toEqual({
      ok: false,
      code: 'network',
    });
  });

  it('bygget mangler adressen → unknown', async () => {
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(await loginCode().requestLoginCode('spiller@example.test')).toEqual({
      ok: false,
      code: 'unknown',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('landsOnCodeStep', () => {
  useWebRoute();

  it('er sant ved ok og ved ett-minutts-sperren, ellers usant', () => {
    const { landsOnCodeStep } = loginCode();
    expect(landsOnCodeStep({ ok: true })).toBe(true);
    expect(landsOnCodeStep({ ok: false, code: 'rate_limited_minute' })).toBe(true);
    for (const code of SEND_LOGIN_CODE_ERRORS.filter((c) => c !== 'rate_limited_minute')) {
      expect([code, landsOnCodeStep({ ok: false, code })]).toEqual([code, false]);
    }
    expect(landsOnCodeStep({ ok: false, code: 'network' })).toBe(false);
  });
});

describe('finishLogin', () => {
  useWebRoute();

  it('poster til ruta etter innloggingen med tokenet', async () => {
    respondWith(200, { ok: true });

    await loginCode().finishLogin();

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/auth/after-login`);
    expect(requestInit().method).toBe('POST');
    expect(headers().Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('kaster ikke på 500', async () => {
    respondWith(500, { error: 'after_login_failed' });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(loginCode().finishLogin()).resolves.toBeUndefined();
  });

  it('kaster ikke når kallet ikke når fram', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(loginCode().finishLogin()).resolves.toBeUndefined();
  });
});

describe('afterLoginSettled', () => {
  useWebRoute();

  it('svarer med en gang når ingen innlogging er i gang', async () => {
    await expect(loginCode().afterLoginSettled()).resolves.toBeUndefined();
  });

  it('venter til finishLogin er ferdig', async () => {
    let answer: (value: unknown) => void = () => {};
    mockFetch.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const { afterLoginSettled, finishLogin } = loginCode();

    void finishLogin();
    let settled = false;
    const waiting = afterLoginSettled().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    answer({ status: 200, json: async () => ({ ok: true }) });
    await waiting;
    expect(settled).toBe(true);
  });

  it('venter aldri lenger enn taket', async () => {
    jest.useFakeTimers();
    try {
      mockFetch.mockReturnValue(new Promise(() => {}));
      const { afterLoginSettled, finishLogin } = loginCode();

      void finishLogin();
      const waiting = afterLoginSettled(1_000);
      jest.advanceTimersByTime(1_000);
      await expect(waiting).resolves.toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});

