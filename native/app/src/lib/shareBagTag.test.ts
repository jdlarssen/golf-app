// #2256 PR 3: «Del bag-taggen» tar bildet og åpner arket bare når de native
// delene finnes, og en feil blir et rolig svar, aldri et kast.
import { NativeModules, TurboModuleRegistry } from 'react-native';
import { canShareBagTag, shareBagTagImage, toFileUrl } from './shareBagTag';

const mockCaptureRef = jest.fn();
jest.mock('react-native-view-shot', () => ({ captureRef: (...args: unknown[]) => mockCaptureRef(...args) }));
const mockShareAsync = jest.fn();
jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => mockShareAsync(...args) }));
// Finnes den native delen i bygget? `null` = et bygg fra før modulene kom inn.
const mockOptionalNativeModule = jest.fn();
jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => mockOptionalNativeModule(name),
}));

const CARD = { current: {} as never };

// Appen kjører bridgeless: `__turboModuleProxy` er ikke satt, og view-shot
// slås opp i `NativeModules`. Med `__turboModuleProxy` (den eldre veien til
// TurboModules) slår pakken opp i registeret; begge veiene testes.
const runtime = globalThis as { __turboModuleProxy?: unknown };

function nativeParts({
  viewShot,
  sharing,
  turboProxy = false,
}: {
  viewShot: boolean;
  sharing: boolean;
  turboProxy?: boolean;
}) {
  if (turboProxy) runtime.__turboModuleProxy = () => null;
  else delete runtime.__turboModuleProxy;
  // jest-expo har en fast mock i `NativeModules`; getteren styres her.
  jest.spyOn(NativeModules, 'RNViewShot', 'get').mockReturnValue(viewShot && !turboProxy ? {} : undefined);
  jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((name: string) =>
    name === 'RNViewShot' && viewShot && turboProxy ? ({} as never) : null,
  );
  mockOptionalNativeModule.mockImplementation((name: string) =>
    name === 'ExpoSharing' && sharing ? {} : null,
  );
}

afterAll(() => {
  delete runtime.__turboModuleProxy;
});

beforeEach(() => {
  jest.restoreAllMocks();
  mockCaptureRef.mockReset().mockResolvedValue('/tmp/ReactNative/bag-tag.png');
  mockShareAsync.mockReset().mockResolvedValue(undefined);
  nativeParts({ viewShot: true, sharing: true });
});

describe('canShareBagTag', () => {
  it.each([
    [false, true, true, true],
    [false, false, true, false],
    [false, true, false, false],
    [true, true, true, true],
    [true, false, true, false],
  ])('turbo-proxy %p: view-shot %p, deling %p → %p', (turboProxy, viewShot, sharing, expected) => {
    nativeParts({ viewShot, sharing, turboProxy });
    expect(canShareBagTag()).toBe(expected);
  });
});

describe('shareBagTagImage', () => {
  it('tar et PNG av kortet og deler det som fil', async () => {
    expect(await shareBagTagImage(CARD)).toEqual({ ok: true });
    expect(mockCaptureRef).toHaveBeenCalledWith(CARD, { format: 'png', result: 'tmpfile' });
    expect(mockShareAsync).toHaveBeenCalledWith('file:///tmp/ReactNative/bag-tag.png', {
      UTI: 'public.png',
      mimeType: 'image/png',
    });
  });

  it('laster ingen modul i et bygg uten de native delene', async () => {
    nativeParts({ viewShot: false, sharing: true });
    expect(await shareBagTagImage(CARD)).toEqual({ ok: false });
    expect(mockCaptureRef).not.toHaveBeenCalled();
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('svarer rolig når bildet eller arket feiler', async () => {
    mockCaptureRef.mockRejectedValueOnce(new Error('ingen visning'));
    expect(await shareBagTagImage(CARD)).toEqual({ ok: false });
    mockShareAsync.mockRejectedValueOnce(new Error('ingen visningskontroller'));
    expect(await shareBagTagImage(CARD)).toEqual({ ok: false });
  });

  it('gjør ingenting før kortet finnes', async () => {
    expect(await shareBagTagImage({ current: null })).toEqual({ ok: false });
    expect(mockCaptureRef).not.toHaveBeenCalled();
  });
});

describe('toFileUrl', () => {
  it('legger på file:// bare der det mangler', () => {
    expect(toFileUrl('/tmp/a.png')).toBe('file:///tmp/a.png');
    expect(toFileUrl('file:///tmp/a.png')).toBe('file:///tmp/a.png');
  });
});
