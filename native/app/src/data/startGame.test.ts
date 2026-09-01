// native/app/src/data/startGame.test.ts
// Native N6b (#1855): «Start runden nå», sett fra appen.
//
// Kjernen er mocket med vilje. Alle reglene den håndhever — tee-rating,
// ufullstendige lag, frysingen av banehandicap, rotasjons-slotene — er testet i
// `lib/games/startScheduledGame.test.ts`, og å kjøre dem om igjen her ville
// bare låst en kopi av webbens suite. Det som testes er OVERSETTELSEN: hva
// appen gjør med hvert svar kjernen kan gi.
//
// Tyngdepunktet er vinner-semantikken (#502). `{ ok: true, started: false }`
// betyr at cron-sweepen, nettsiden eller E1-fallbacken rakk status-flippen
// først — runden ER i gang, og det er suksess. Leses den som en feil, får
// arrangøren en feilmelding om en runde som nettopp startet.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));

const mockNetwork = { online: true };
jest.mock('./syncTriggers', () => ({
  isDeviceOnline: () => mockNetwork.online,
}));

jest.mock('../../../../lib/games/startScheduledGameCore', () => ({
  startScheduledGameCore: jest.fn(),
}));

const GAME = 'game-1';

type Mocks = typeof import('../test/supabaseMock');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function core(): jest.Mock {
  return (
    require('../../../../lib/games/startScheduledGameCore') as {
      startScheduledGameCore: jest.Mock;
    }
  ).startScheduledGameCore;
}

function startRoundNow(gameId: string) {
  return (require('./startGame') as typeof import('./startGame')).startRoundNow(
    gameId,
  );
}

describe('startRoundNow', () => {
  useFreshModules();

  beforeEach(() => {
    mockNetwork.online = true;
  });

  it('nekter uten nett, og spør aldri kjernen', async () => {
    mockNetwork.online = false;

    expect(await startRoundNow(GAME)).toEqual({ ok: false, reason: 'offline' });
    expect(core()).not.toHaveBeenCalled();
  });

  it('melder suksess når VI vant status-flippen', async () => {
    core().mockResolvedValue({
      ok: true,
      started: true,
      gameName: 'Torsdagsrunden',
      expiredSignups: [],
    });

    expect(await startRoundNow(GAME)).toEqual({
      ok: true,
      alreadyRunning: false,
    });
  });

  it('melder suksess også når en ANNEN aktør vant flippen (#502)', async () => {
    // Cron-sweepen på tee-off, nettsidens knapp eller E1-fallbacken kom først.
    // Runden er i gang — nøyaktig det arrangøren ba om. Ingen feil.
    core().mockResolvedValue({
      ok: true,
      started: false,
      gameName: 'Torsdagsrunden',
      expiredSignups: [],
    });

    expect(await startRoundNow(GAME)).toEqual({
      ok: true,
      alreadyRunning: true,
    });
  });

  it('slipper de auto-avviste søkerne — appen varsler ikke (bokført gap)', async () => {
    core().mockResolvedValue({
      ok: true,
      started: true,
      gameName: 'Torsdagsrunden',
      expiredSignups: [{ requestId: 'req-1', userId: 'user-9' }],
    });

    // Ingen `expiredSignups` i svaret: `notify` er server-eid, og et felt
    // skjermen ikke kan gjøre noe med inviterer bare til å vise det.
    expect(await startRoundNow(GAME)).toEqual({
      ok: true,
      alreadyRunning: false,
    });
  });

  it('bytter ventende spilleres e-post mot navn, og beholder e-posten når navnet mangler', async () => {
    core().mockResolvedValue({
      ok: false,
      reason: 'pending_players',
      pendingEmails: ['kari@example.no', 'ola@example.no', 'ukjent@example.no'],
    });
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      users: [
        queryStub({
          data: [
            { email: 'kari@example.no', name: 'Kari Nordmann', nickname: null },
            { email: 'ola@example.no', name: 'Ola Nordmann', nickname: 'Olsen' },
          ],
          error: null,
        }),
      ],
    });

    expect(await startRoundNow(GAME)).toEqual({
      ok: false,
      reason: 'pending_players',
      // Kallenavn slår navn; raden som ikke kom tilbake beholder e-posten sin,
      // som er det eneste som faktisk identifiserer personen.
      pendingLabels: ['Kari Nordmann', 'Olsen', 'ukjent@example.no'],
    });
  });

  it('faller tilbake til e-post når hele navne-oppslaget feiler', async () => {
    core().mockResolvedValue({
      ok: false,
      reason: 'pending_players',
      pendingEmails: ['kari@example.no'],
    });
    const { queryStub, routeFrom } = mocks();
    routeFrom({
      users: [queryStub({ data: null, error: { message: 'nett nede' } })],
    });

    expect(await startRoundNow(GAME)).toEqual({
      ok: false,
      reason: 'pending_players',
      pendingLabels: ['kari@example.no'],
    });
  });

  it('bærer rotasjons-formatet og antallet videre til meldingen (#969)', async () => {
    core().mockResolvedValue({
      ok: false,
      reason: 'rotation_player_count',
      rotationMode: 'wolf',
      rotationActiveCount: 2,
    });

    expect(await startRoundNow(GAME)).toEqual({
      ok: false,
      reason: 'rotation_player_count',
      rotationMode: 'wolf',
      rotationActiveCount: 2,
    });
  });

  it('sender en vanlig avslagskode videre uten pynt', async () => {
    core().mockResolvedValue({ ok: false, reason: 'unassigned_teams' });

    expect(await startRoundNow(GAME)).toEqual({
      ok: false,
      reason: 'unassigned_teams',
    });
  });
});
