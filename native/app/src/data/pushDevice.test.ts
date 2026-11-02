// #2256 PR 4: registreringen av telefonens APNs-token (Type A mot
// supabase-mocken). Kriteriene 15, 17 og 18 i kontrakten, uten telefon: raden
// skrives for riktig bruker, en annen konto overtar via `claim_apns_token`,
// «Slå av» og utlogging sletter raden, et nei lagrer ingenting, og et token
// husket for en annen konto ryddes ved neste innlogging.
/* eslint-disable @typescript-eslint/no-require-imports -- modulene hentes per test, etter jest.resetModules() (se harness.ts) */
import { Platform } from 'react-native';
import { useFreshModules } from '../test/harness';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

const mockNotifications = {
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
};
jest.mock('expo-notifications', () => mockNotifications);
// Finnes den native delen i bygget? `null` = et bygg fra før modulen kom inn.
const mockOptionalNativeModule = jest.fn();
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => mockOptionalNativeModule(name),
}));

const ME = 'user-me';
const OTHER = 'user-other';
// Repoets kanoniske dummy-token (tillatt i .gitleaks.toml); testen bryr seg ikke om formatet.
const TOKEN = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
/** Det telefonen husker når varslene står på for `userId`. */
const remembered = (userId: string) => JSON.stringify({ userId, token: TOKEN });

type Mocks = typeof import('../test/supabaseMock');
type PushDevice = typeof import('./pushDevice');

function mocks(): Mocks {
  return require('../test/supabaseMock') as Mocks;
}

function subject(): PushDevice {
  return require('./pushDevice') as PushDevice;
}

/** Samme minnelager som koden ser: modulene hentes på nytt per test. */
function storage(): typeof import('@react-native-async-storage/async-storage').default {
  return (require('@react-native-async-storage/async-storage') as { default: typeof import('@react-native-async-storage/async-storage').default }).default;
}

describe('pushDevice', () => {
  useFreshModules();

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockOptionalNativeModule.mockReset().mockReturnValue({});
    mockNotifications.getPermissionsAsync.mockReset().mockResolvedValue({ granted: false, canAskAgain: true });
    mockNotifications.requestPermissionsAsync.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
    mockNotifications.getDevicePushTokenAsync.mockReset().mockResolvedValue({ type: 'ios', data: TOKEN });
    mockNotifications.addPushTokenListener.mockReset();
    mocks().currentDeviceUserId.mockResolvedValue(ME);
    await storage().clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('slår på: skriver raden for innlogget bruker og husker tokenet', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    const upsert = queryStub({ data: [{ id: 'row-1' }], error: null });
    routeFrom({ apns_tokens: [upsert] });

    expect(await subject().turnOnPush()).toEqual({ ok: true });

    const [[row, options]] = stepArgs(upsert, 'upsert') as [[{ user_id: string; token: string }, unknown]];
    expect(row).toMatchObject({ user_id: ME, token: TOKEN });
    expect(options).toEqual({ onConflict: 'token' });
    expect(stepArgs(upsert, 'select')).toEqual([[]]);
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(ME));
    expect(mocks().supabase.rpc).not.toHaveBeenCalled();
  });

  it('overtar tokenet fra en annen konto på samme telefon med claim_apns_token', async () => {
    const { queryStub, routeFrom, supabase } = mocks();
    routeFrom({ apns_tokens: [queryStub({ data: null, error: { message: 'rls', code: '42501' } })] });
    supabase.rpc.mockResolvedValue({ data: null, error: null });

    expect(await subject().turnOnPush()).toEqual({ ok: true });
    expect(supabase.rpc).toHaveBeenCalledWith('claim_apns_token', {
      p_token: TOKEN,
      p_user_agent: expect.stringContaining('iOS'),
    });
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(ME));
  });

  it('lagrer ingenting når spilleren sier nei', async () => {
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await subject().turnOnPush()).toEqual({ ok: false, reason: 'denied' });
    expect(mocks().supabase.from).not.toHaveBeenCalled();
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBeNull();
  });

  it('husker ikke tokenet når raden ikke ble skrevet', async () => {
    const { queryStub, routeFrom } = mocks();
    // 0 rader uten feil er også en feil (#667): ingen rad = ingen varsler.
    routeFrom({ apns_tokens: [queryStub({ data: [], error: null })] });
    expect(await subject().turnOnPush()).toEqual({ ok: false, reason: 'failed' });
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBeNull();
  });

  it('slår av: sletter egen rad for tokenet, og glemmer det først når basen svarte', async () => {
    const { queryStub, routeFrom, stepArgs } = mocks();
    await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
    const failed = queryStub({ data: null, error: { message: 'uten nett' } });
    // 0 rader: senderen ryddet raden etter en 410 fra Apple. Av er av.
    const gone = queryStub({ data: [], error: null });
    routeFrom({ apns_tokens: [failed, gone] });

    expect(await subject().turnOffPush()).toEqual({ ok: false, reason: 'failed' });
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(ME));

    expect(await subject().turnOffPush()).toEqual({ ok: true });
    expect(stepArgs(gone, 'eq')).toEqual([
      ['token', TOKEN],
      ['user_id', ME],
    ]);
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBeNull();
  });

  it('utlogging glemmer tokenet bare når basen bekreftet at raden er borte', async () => {
    const { queryStub, routeFrom } = mocks();
    await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
    const failed = queryStub({ data: null, error: { message: 'uten nett' } });
    const deleted = queryStub({ data: [{ id: 'row-1' }], error: null });
    // 0 rader: senderen ryddet raden etter en 410. Borte er borte.
    const gone = queryStub({ data: [], error: null });
    routeFrom({ apns_tokens: [failed, deleted, gone] });

    // Uten nett: husket med kontoen, så neste innlogging kan rydde.
    await subject().forgetPushBeforeSignOut();
    expect(failed.steps.map((s) => s.method)).toEqual(['delete', 'eq', 'eq', 'select']);
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(ME));

    await subject().forgetPushBeforeSignOut();
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBeNull();

    await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
    await subject().forgetPushBeforeSignOut();
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBeNull();
  });

  it('utlogging uten sesjonen for kontoen sletter ingenting og husker tokenet', async () => {
    mocks().currentDeviceUserId.mockResolvedValue(null);
    await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
    await subject().forgetPushBeforeSignOut();
    expect(mocks().supabase.from).not.toHaveBeenCalled();
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(ME));
  });

  it('viser på bare for kontoen tokenet ble slått på for', async () => {
    expect(await subject().readPushState()).toBe('off');
    await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
    expect(await subject().readPushState()).toBe('on');
    await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(OTHER));
    expect(await subject().readPushState()).toBe('off');
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await subject().readPushState()).toBe('denied');
  });

  it('ny innlogging rydder raden til forrige konto, så den ikke får varsler hit', async () => {
    const { queryStub, routeFrom, stepArgs, supabase } = mocks();
    await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(OTHER));
    supabase.rpc.mockResolvedValue({ data: null, error: null });
    const deleted = queryStub({ data: [{ id: 'row-1' }], error: null });
    routeFrom({ apns_tokens: [deleted] });

    await subject().settlePushOwner();

    // Telefonen viser fram tokenet og flytter raden hit, og sletter den så.
    expect(supabase.rpc).toHaveBeenCalledWith('claim_apns_token', {
      p_token: TOKEN,
      p_user_agent: expect.stringContaining('iOS'),
    });
    expect(stepArgs(deleted, 'eq')).toEqual([
      ['token', TOKEN],
      ['user_id', ME],
    ]);
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBeNull();
  });

  it('ny innlogging rører ingenting for samme konto, og prøver igjen når basen ikke svarer', async () => {
    const { supabase } = mocks();
    await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
    await subject().settlePushOwner();
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(ME));

    await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(OTHER));
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'uten nett' } });
    await subject().settlePushOwner();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(OTHER));
  });

  it('har ingen varsler uten den native delen', async () => {
    mockOptionalNativeModule.mockReturnValue(null);
    expect(await subject().readPushState()).toBe('unsupported');
    expect(await subject().turnOnPush()).toEqual({ ok: false, reason: 'unsupported' });
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('har ingen varsler på andre plattformer enn iPhone og Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    expect(await subject().readPushState()).toBe('unsupported');
  });

  describe('på Android (#2758)', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
      mockNotifications.getDevicePushTokenAsync.mockResolvedValue({ type: 'android', data: TOKEN });
    });

    it('slår på: skriver raden i fcm_tokens, og rører ikke apns_tokens', async () => {
      const { queryStub, routeFrom, stepArgs, supabase } = mocks();
      const upsert = queryStub({ data: [{ id: 'row-1' }], error: null });
      routeFrom({ fcm_tokens: [upsert] });

      expect(await subject().turnOnPush()).toEqual({ ok: true });

      const [[row, options]] = stepArgs(upsert, 'upsert') as [[{ user_id: string; token: string; user_agent: string }, unknown]];
      expect(row).toMatchObject({ user_id: ME, token: TOKEN });
      expect(row.user_agent).toContain('Android');
      expect(options).toEqual({ onConflict: 'token' });
      expect(supabase.from.mock.calls.map(([table]: [string]) => table)).toEqual(['fcm_tokens']);
      expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(ME));
    });

    it('overtar tokenet fra en annen konto med claim_fcm_token', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      routeFrom({ fcm_tokens: [queryStub({ data: null, error: { message: 'rls', code: '42501' } })] });
      supabase.rpc.mockResolvedValue({ data: null, error: null });

      expect(await subject().turnOnPush()).toEqual({ ok: true });

      expect(supabase.rpc).toHaveBeenCalledWith('claim_fcm_token', {
        p_token: TOKEN,
        p_user_agent: expect.stringContaining('Android'),
      });
    });

    it('oppretter kanalen serveren sender til før den spør om tillatelsen', async () => {
      const { queryStub, routeFrom } = mocks();
      routeFrom({ fcm_tokens: [queryStub({ data: [{ id: 'row-1' }], error: null })] });
      const order: string[] = [];
      mockNotifications.setNotificationChannelAsync.mockReset().mockImplementation(async () => {
        order.push('channel');
      });
      mockNotifications.requestPermissionsAsync.mockImplementation(async () => {
        order.push('permission');
        return { granted: true, canAskAgain: true };
      });

      await subject().turnOnPush();

      expect(order).toEqual(['channel', 'permission']);
      expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith('varsler', {
        name: 'Varsler',
        importance: 4,
      });
    });

    it('oppretter ikke kanalen på iPhone, og kaster ikke når den feiler', async () => {
      mockNotifications.setNotificationChannelAsync.mockReset().mockRejectedValue(new Error('nei'));

      await expect(subject().ensurePushChannel()).resolves.toBeUndefined();

      jest.replaceProperty(Platform, 'OS', 'ios');
      mockNotifications.setNotificationChannelAsync.mockClear();
      await subject().ensurePushChannel();
      expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    });

    it('slår av: sletter raden i fcm_tokens', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
      const deleted = queryStub({ data: [{ id: 'row-1' }], error: null });
      routeFrom({ fcm_tokens: [deleted] });

      expect(await subject().turnOffPush()).toEqual({ ok: true });

      expect(stepArgs(deleted, 'eq')).toEqual([
        ['token', TOKEN],
        ['user_id', ME],
      ]);
      expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBeNull();
    });

    it('ny innlogging rydder forrige kontos rad med claim_fcm_token', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(OTHER));
      supabase.rpc.mockResolvedValue({ data: null, error: null });
      routeFrom({ fcm_tokens: [queryStub({ data: [{ id: 'row-1' }], error: null })] });

      await subject().settlePushOwner();

      expect(supabase.rpc).toHaveBeenCalledWith('claim_fcm_token', {
        p_token: TOKEN,
        p_user_agent: expect.stringContaining('Android'),
      });
      expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBeNull();
    });

    it('et nei som kan spørres om igjen er ikke «nektet»: bryteren kan prøve på nytt', async () => {
      mockNotifications.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });

      expect(await subject().turnOnPush()).toEqual({ ok: false, reason: 'declined' });

      expect(mocks().supabase.from).not.toHaveBeenCalled();
      expect(await subject().readPushState()).toBe('off');
    });

    it('et nei for godt viser veien til Innstillinger', async () => {
      mockNotifications.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

      expect(await subject().turnOnPush()).toEqual({ ok: false, reason: 'denied' });
      expect(await subject().readPushState()).toBe('denied');
    });

    it('står ikke på «På» når tillatelsen er tatt bort etter ja', async () => {
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });

      expect(await subject().readPushState()).toBe('off');
    });

    it('står på «På» når tillatelsen er gitt og tokenet er husket', async () => {
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });

      expect(await subject().readPushState()).toBe('on');
    });
  });

  // #2758: skifter tokenet, eller rydder serveren raden, skal bryteren ikke stå
  // på «På» uten at noe kommer. Gjelder begge telefoner.
  describe.each([
    ['ios', 'apns_tokens', 'claim_apns_token'],
    ['android', 'fcm_tokens', 'claim_fcm_token'],
  ] as const)('syncPushToken på %s', (os, table, claim) => {
    const NEW_TOKEN = 'new-token-from-the-os';

    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', os);
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    });

    it('gjør ingenting når varsler er av', async () => {
      await subject().syncPushToken();

      expect(mockNotifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
      expect(mocks().supabase.from).not.toHaveBeenCalled();
    });

    it('gjør ingenting uten tillatelsen', async () => {
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
      mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });

      await subject().syncPushToken();

      expect(mockNotifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
      expect(mocks().supabase.from).not.toHaveBeenCalled();
    });

    it('gjør ingenting når tokenet er husket for en annen konto', async () => {
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(OTHER));

      await subject().syncPushToken();

      expect(mocks().supabase.from).not.toHaveBeenCalled();
      expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(OTHER));
    });

    it('skriver raden på nytt med samme token, i tilfelle serveren har ryddet den', async () => {
      const { queryStub, routeFrom, stepArgs, supabase } = mocks();
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
      const upsert = queryStub({ data: [{ id: 'row-1' }], error: null });
      routeFrom({ [table]: [upsert] });

      await subject().syncPushToken();

      const [[row]] = stepArgs(upsert, 'upsert') as [[{ user_id: string; token: string }]];
      expect(row).toMatchObject({ user_id: ME, token: TOKEN });
      expect(supabase.from).toHaveBeenCalledTimes(1);
      expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(ME));
    });

    it('et nytt token skrives, den gamle raden slettes, og det nye huskes', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
      mockNotifications.getDevicePushTokenAsync.mockResolvedValue({ type: os, data: NEW_TOKEN });
      const upsert = queryStub({ data: [{ id: 'row-2' }], error: null });
      const deleted = queryStub({ data: [{ id: 'row-1' }], error: null });
      routeFrom({ [table]: [upsert, deleted] });

      await subject().syncPushToken();

      const [[row]] = stepArgs(upsert, 'upsert') as [[{ token: string }]];
      expect(row.token).toBe(NEW_TOKEN);
      expect(stepArgs(deleted, 'eq')).toEqual([
        ['token', TOKEN],
        ['user_id', ME],
      ]);
      expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(
        JSON.stringify({ userId: ME, token: NEW_TOKEN }),
      );
    });

    it('tar tokenet over når en annen konto står på raden', async () => {
      const { queryStub, routeFrom, supabase } = mocks();
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
      routeFrom({ [table]: [queryStub({ data: null, error: { message: 'rls', code: '42501' } })] });
      supabase.rpc.mockResolvedValue({ data: null, error: null });

      await subject().syncPushToken();

      expect(supabase.rpc).toHaveBeenCalledWith(claim, { p_token: TOKEN, p_user_agent: expect.any(String) });
    });

    it('kaster aldri, og husker fortsatt det gamle når basen ikke svarer', async () => {
      const { queryStub, routeFrom } = mocks();
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
      mockNotifications.getDevicePushTokenAsync.mockResolvedValue({ type: os, data: NEW_TOKEN });
      routeFrom({ [table]: [queryStub({ data: null, error: { message: 'nede', code: '500' } })] });

      await expect(subject().syncPushToken()).resolves.toBeUndefined();

      expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(ME));
    });

    it('kaster aldri når telefonen ikke gir et token', async () => {
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
      mockNotifications.getDevicePushTokenAsync.mockRejectedValue(new Error('ingen Google Play-tjenester'));

      await expect(subject().syncPushToken()).resolves.toBeUndefined();

      expect(mocks().supabase.from).not.toHaveBeenCalled();
    });

    it('lytter på token-endring, skriver det nye når varsler er på, og lar seg stoppe', async () => {
      const { queryStub, routeFrom, stepArgs } = mocks();
      await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));
      const upsert = queryStub({ data: [{ id: 'row-2' }], error: null });
      routeFrom({ [table]: [upsert, queryStub({ data: [{ id: 'row-1' }], error: null })] });
      const remove = jest.fn();
      let listener: ((token: { data: string }) => void) | null = null;
      mockNotifications.addPushTokenListener.mockImplementation((next: typeof listener) => {
        listener = next;
        return { remove };
      });

      const stop = subject().listenForPushTokenChanges();
      listener!({ data: NEW_TOKEN });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      const [[row]] = stepArgs(upsert, 'upsert') as [[{ token: string }]];
      expect(row.token).toBe(NEW_TOKEN);
      stop();
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('lytteren skriver ingenting når varsler er av', async () => {
      let listener: ((token: { data: string }) => void) | null = null;
      mockNotifications.addPushTokenListener.mockImplementation((next: typeof listener) => {
        listener = next;
        return { remove: jest.fn() };
      });

      subject().listenForPushTokenChanges();
      listener!({ data: NEW_TOKEN });
      await new Promise((resolve) => setImmediate(resolve));

      expect(mocks().supabase.from).not.toHaveBeenCalled();
    });
  });

  it('syncPushToken og lytteren gjør ingenting uten den native delen', async () => {
    mockOptionalNativeModule.mockReturnValue(null);
    await storage().setItem(subject().PUSH_TOKEN_KEY, remembered(ME));

    await subject().syncPushToken();
    subject().listenForPushTokenChanges()();

    expect(mockNotifications.addPushTokenListener).not.toHaveBeenCalled();
    expect(mocks().supabase.from).not.toHaveBeenCalled();
  });
});
