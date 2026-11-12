// #2841: kallet til den native modulen for appvelgeren på Android (Type A).
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { setRecentsScreenshotEnabled } from './recentsScreenshot';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn() }));

const requireModule = requireOptionalNativeModule as jest.Mock;

describe('setRecentsScreenshotEnabled', () => {
  const setEnabled = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    setEnabled.mockReturnValue(true);
    requireModule.mockReturnValue({ setEnabled });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('gjør ingenting på iOS', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(setRecentsScreenshotEnabled(false)).toBe(false);
    expect(requireModule).not.toHaveBeenCalled();
  });

  it.each([false, true])('sender %p videre til modulen på Android', (enabled) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(setRecentsScreenshotEnabled(enabled)).toBe(true);
    expect(requireModule).toHaveBeenCalledWith('RecentsScreenshot');
    expect(setEnabled).toHaveBeenCalledWith(enabled);
  });

  it('svarer false når modulen sier nei (Android under API 33)', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    setEnabled.mockReturnValue(false);
    expect(setRecentsScreenshotEnabled(false)).toBe(false);
  });

  it('svarer false når bygget ikke har modulen', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    requireModule.mockReturnValue(null);
    expect(setRecentsScreenshotEnabled(false)).toBe(false);
  });

  it('kaster ikke når det native laget kaster', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setEnabled.mockImplementation(() => {
      throw new Error('native');
    });
    expect(setRecentsScreenshotEnabled(false)).toBe(false);
  });
});
