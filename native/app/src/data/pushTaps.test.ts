// #2256 PR 4: trykk på et varsel åpner spillet (kriterium 16), og varsler
// vises ikke som banner mens appen er åpen. Et håndtert trykk åpnes aldri
// igjen. Type A mot en mock av pakken.
import { Platform } from 'react-native';
import { listenForPushTaps } from './pushTaps';

const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';
let responseListener: ((response: unknown) => void) | null = null;
const mockRemove = jest.fn();
const mockNotifications = {
  DEFAULT_ACTION_IDENTIFIER: DEFAULT_ACTION,
  setNotificationHandler: jest.fn(),
  getLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn((listener: (response: unknown) => void) => {
    responseListener = listener;
    return { remove: mockRemove };
  }),
};
jest.mock('expo-notifications', () => mockNotifications);
const mockOptionalNativeModule = jest.fn();
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => mockOptionalNativeModule(name),
}));
jest.mock('../supabase', () => ({ supabase: {}, currentDeviceUserId: jest.fn() }));

const GAME = 'game-1';

function tap(url: string, actionIdentifier = DEFAULT_ACTION, identifier = `id-${url}`) {
  return {
    actionIdentifier,
    notification: {
      request: { identifier, content: { data: null }, trigger: { type: 'push', payload: { url } } },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  responseListener = null;
  jest.replaceProperty(Platform, 'OS', 'ios');
  mockOptionalNativeModule.mockReturnValue({});
  mockNotifications.getLastNotificationResponse.mockReturnValue(null);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('listenForPushTaps', () => {
  it('åpner spillet ved trykk, og viser ikke banner mens appen er åpen', async () => {
    const open = jest.fn();
    const stop = listenForPushTaps(open);

    const handler = mockNotifications.setNotificationHandler.mock.calls[0][0] as {
      handleNotification: () => Promise<Record<string, boolean>>;
    };
    expect(await handler.handleNotification()).toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });

    responseListener?.(tap(`/games/${GAME}/leaderboard`));
    expect(open).toHaveBeenCalledWith({ name: 'GameHome', params: { gameId: GAME } });
    responseListener?.(tap('/admin/games/x'));
    expect(open).toHaveBeenLastCalledWith({ name: 'Home' });

    stop();
    expect(mockRemove).toHaveBeenCalled();
  });

  it('åpner spillet når trykket startet appen, og tømmer det etterpå', () => {
    mockNotifications.getLastNotificationResponse.mockReturnValue(tap(`/games/${GAME}`));
    const open = jest.fn();
    listenForPushTaps(open);

    expect(open).toHaveBeenCalledWith({ name: 'GameHome', params: { gameId: GAME } });
    expect(mockNotifications.clearLastNotificationResponse).toHaveBeenCalled();

    // Samme trykk kan også komme i lytteren; det åpnes én gang.
    responseListener?.(tap(`/games/${GAME}`));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('tømmer også et trykk mens appen var åpen, så neste innlogging ikke åpner det igjen', () => {
    listenForPushTaps(jest.fn());
    responseListener?.(tap(`/games/${GAME}`));
    expect(mockNotifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  it('ser bort fra andre handlinger enn selve trykket', () => {
    const open = jest.fn();
    listenForPushTaps(open);
    responseListener?.(tap(`/games/${GAME}`, 'expo.modules.notifications.actions.DISMISS'));
    expect(open).not.toHaveBeenCalled();
  });

  it('gjør ingenting uten den native delen', () => {
    mockOptionalNativeModule.mockReturnValue(null);
    const stop = listenForPushTaps(jest.fn());
    expect(mockNotifications.setNotificationHandler).not.toHaveBeenCalled();
    expect(mockNotifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
    stop();
  });
});
