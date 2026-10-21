// native/app/src/data/updateCheck.test.ts
// Native #2619: nettkallet bak oppdateringsvakta. Det eneste det skal love er at
// det aldri kaster og aldri henger: alt som ikke er et ferdig 200-svar innen
// fristen blir `null`.
import { fetchMinVersionBody, MIN_VERSION_PATH } from './updateCheck';
import { callPublicWebRoute } from './webApi';
import { FETCH_TIMEOUT_MS } from '../lib/updateGuard';

jest.mock('./webApi', () => ({ callPublicWebRoute: jest.fn() }));

const call = callPublicWebRoute as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  call.mockReset();
});
afterEach(() => jest.useRealTimers());

describe('fetchMinVersionBody', () => {
  it('spør den offentlige ruta med GET og gir kroppen tilbake', async () => {
    call.mockResolvedValue({ ok: true, status: 200, body: { ios: { minBuild: 3 } } });
    expect(await fetchMinVersionBody()).toEqual({ ios: { minBuild: 3 } });
    expect(call).toHaveBeenCalledWith(MIN_VERSION_PATH, 'GET');
  });

  it.each([
    ['offline', { ok: false, reason: 'offline' }],
    ['nettfeil', { ok: false, reason: 'network' }],
    ['500', { ok: true, status: 500, body: {} }],
  ])('gir null ved %s', async (_label, result) => {
    call.mockResolvedValue(result);
    expect(await fetchMinVersionBody()).toBeNull();
  });

  it('gir null når kallet kaster', async () => {
    call.mockRejectedValue(new Error('boom'));
    expect(await fetchMinVersionBody()).toBeNull();
  });

  it('gir null når ruta ikke svarer innen fristen', async () => {
    call.mockReturnValue(new Promise(() => undefined));
    const pending = fetchMinVersionBody();
    await jest.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    expect(await pending).toBeNull();
  });
});
