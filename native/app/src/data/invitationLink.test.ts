// native/app/src/data/invitationLink.test.ts
// #2748: svarene fra ruta, sett fra appen (Type A). Reglene er på serveren. Her testes
// oversettelsen, og at ingenting sendes uten nett.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import {
  BASE_URL,
  TOKEN,
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

const INVITE = '44444444-4444-4444-8444-444444444444';

function link(): typeof import('./invitationLink') {
  return require('./invitationLink') as typeof import('./invitationLink');
}

describe('openInvitationLink', () => {
  useWebRoute();

  it('poster til lenka uten kropp: kalleren er tokenet og invitasjonen står i stien', async () => {
    respondWith(200, { status: 'in_game', gameId: 'g1' });
    expect(await link().openInvitationLink(INVITE)).toEqual({ ok: true, gameId: 'g1' });
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/invitasjon/${INVITE}`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect((requestInit().headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(requestInit().body).toBeUndefined();
  });

  it.each(['started', 'no_game', 'other_account'])('200 %s er et endelig svar', async (status) => {
    respondWith(200, { status });
    expect(await link().openInvitationLink(INVITE)).toEqual({ ok: false, outcome: status });
  });

  it('404 er et endelig svar', async () => {
    respondWith(404, { error: 'not_found' });
    expect(await link().openInvitationLink(INVITE)).toEqual({ ok: false, outcome: 'not_found' });
  });

  it.each([
    [401, {}, 'unauthorized'],
    [500, { error: 'open_failed' }, 'open_failed'],
    [200, { status: 'in_game' }, 'open_failed'],
    [200, { status: 'noe_nytt' }, 'open_failed'],
  ])('oversetter %i %j til %s, som kan prøves igjen', async (status, body, reason) => {
    respondWith(status, body);
    expect(await link().openInvitationLink(INVITE)).toEqual({ ok: false, reason });
  });

  it('sender ingenting uten nett', async () => {
    mockNetwork.online = false;
    expect(await link().openInvitationLink(INVITE)).toEqual({ ok: false, reason: 'offline' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
