// #3019: avgjørelsen bak `TermsGate`, samme regler som `aiConsentGate`:
// husket svar eller uten nett → inn uten å lese; godtatt → inn og husket;
// ikke godtatt → spørsmålet; lesingen feiler eller henger → inn.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetworkStateAsync } from 'expo-network';
import { fetchTermsAccepted } from './terms';
import { forgetTermsAnswers, rememberTermsAccepted, termsStepFor } from './termsGate';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock('./terms', () => ({ fetchTermsAccepted: jest.fn() }));

const fetchMock = fetchTermsAccepted as jest.Mock;
const networkMock = getNetworkStateAsync as jest.Mock;
const USER = 'user-me';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  networkMock.mockResolvedValue({ isConnected: true });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('termsStepFor', () => {
  it('ikke godtatt → spørsmålet', async () => {
    fetchMock.mockResolvedValue(false);
    expect(await termsStepFor(USER)).toBe(true);
  });

  it('godtatt → inn, og husket så neste oppstart ikke leser', async () => {
    fetchMock.mockResolvedValue(true);
    expect(await termsStepFor(USER)).toBe(false);
    fetchMock.mockClear();
    expect(await termsStepFor(USER)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uten nett → inn uten å lese', async () => {
    networkMock.mockResolvedValue({ isConnected: false });
    expect(await termsStepFor(USER)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lesingen feiler → inn', async () => {
    fetchMock.mockRejectedValue(new Error('nede'));
    expect(await termsStepFor(USER)).toBe(false);
  });

  it('lesingen henger → inn etter taket', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    expect(await termsStepFor(USER, { timeoutMs: 10 })).toBe(false);
  });

  it('glemte svar leses på nytt (kontoen slettes)', async () => {
    await rememberTermsAccepted(USER);
    await forgetTermsAnswers();
    fetchMock.mockResolvedValue(false);
    expect(await termsStepFor(USER)).toBe(true);
  });
});
