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
};
jest.mock('expo-notifications', () => mockNotifications, { virtual: true });
// Finnes den native delen i bygget? `null` = et bygg fra før modulen kom inn.
const mockOptionalNativeModule = jest.fn();
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => mockOptionalNativeModule(name),
}));

const ME = 'user-me';
const OTHER = 'user-other';
const TOKEN = 'a1b2c3d4e5f6';
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
    routeFrom({ apns_tokens: [failed, deleted] });

    // Uten nett: husket med kontoen, så neste innlogging kan rydde.
    await subject().forgetPushBeforeSignOut();
    expect(failed.steps.map((s) => s.method)).toEqual(['delete', 'eq', 'eq', 'select']);
    expect(await storage().getItem(subject().PUSH_TOKEN_KEY)).toBe(remembered(ME));

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

  it('har ingen varsler uten den native delen, og ikke på Android', async () => {
    mockOptionalNativeModule.mockReturnValue(null);
    expect(await subject().readPushState()).toBe('unsupported');
    expect(await subject().turnOnPush()).toEqual({ ok: false, reason: 'unsupported' });
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();

    mockOptionalNativeModule.mockReturnValue({});
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(await subject().readPushState()).toBe('unsupported');
  });
});
