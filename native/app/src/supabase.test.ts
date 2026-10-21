// native/app/src/supabase.test.ts
// #1954 D2: den ekte klienten, med et nett som henger.
//
// Alle andre suiter mocker `./supabase` (se test/supabaseMock.ts). Her er det
// klienten selv som er under test: at tidstaket faktisk sitter i
// `createClient`, og at feilen supabase-js lager av det, leses som nett der
// appen leser den. Uten taket svarte hverken RPC-en eller kodesjekken noen
// gang, og «Lever scorekort» sto på «Synker slag …».
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() */
import { REQUEST_TIMEOUT_MS } from './data/timedFetch';
import { useHangingNetwork } from './test/harness';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

type Client = typeof import('./supabase');

describe('supabase-klienten med et nett som henger (#1954 D2)', () => {
  const { untilSent } = useHangingNetwork();

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('en RPC som henger, svarer med en nettfeil etter taket', async () => {
    const { supabase } = require('./supabase') as Client;
    let reply: { error: { message: string } | null } | null = null;
    void supabase
      .rpc('upsert_score_if_newer', {
        p_game_id: 'game-1',
        p_user_id: 'user-1',
        p_hole_number: 1,
        p_strokes: 4,
        p_entered_by: 'user-1',
        p_client_updated_at: '2026-10-21T10:00:00.000Z',
        p_putts: 0,
      })
      .then((r) => {
        reply = r;
      });
    await untilSent();

    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(reply).not.toBeNull();
    const { syncRetryDecision } = require('../../../lib/sync/classifyError') as typeof import('../../../lib/sync/classifyError');
    const message = reply!.error!.message;
    expect(message).toMatch(/network request failed/i);
    // Køen prøver igjen, aldri karantene.
    expect(syncRetryDecision({ attemptCount: 99, errorMessage: message })).toBe('retry');
  });

  it('kodesjekken som når taket, sier «sjekk nettet», ikke «feil kode»', async () => {
    const { supabase } = require('./supabase') as Client;
    let reply: { error: { message?: string; code?: string } | null } | null = null;
    void supabase.auth
      .verifyOtp({ email: 'spiller@example.com', token: '12345678', type: 'email' })
      .then((r) => {
        reply = r;
      });
    await untilSent();

    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect(reply).not.toBeNull();
    const { classifyVerifyError } = require('./lib/loginCopy') as typeof import('./lib/loginCopy');
    expect(classifyVerifyError(reply!.error!)).toBe('network');
  });
});
