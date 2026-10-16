// native/app/src/data/aiConsentGate.test.ts
// #2561 PR B: avgjørelsen bak `AiConsentGate` — skal spørsmålet om AI-tekster
// vises?
//
// Spørsmålet kommer én gang, når spilleren ikke har svart. Appen er
// offline-først, så porten slipper deg inn ved tvil. Det er trygt, fordi
// navnet bare går til AI-en med «ja» (lib/ai/consent.ts): en som slipper
// forbi, står ikke med navn i noen tekst før hen har svart.
//
//  1. **Husket svar → inn, uten å lese.** Et svar enheten har sett, leses ikke
//     igjen; bryteren i «Personvern og konto» endrer det senere.
//  2. **Uten nett → inn, uten å lese.** Spørsmålet kommer neste gang med nett.
//  3. **Svart (ja eller nei) → inn, og husket.**
//  4. **Ikke svart → spørsmålet.**
//  5. **Lesingen feiler eller henger → inn.**
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetworkStateAsync } from 'expo-network';
import { fetchOwnAiConsent } from './aiConsent';
import { aiConsentStepFor, forgetAiConsentAnswers, rememberAiConsentAnswered } from './aiConsentGate';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock('./aiConsent', () => ({ fetchOwnAiConsent: jest.fn() }));

const fetchMock = fetchOwnAiConsent as jest.Mock;
const networkMock = getNetworkStateAsync as jest.Mock;

const USER = 'user-me';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  networkMock.mockResolvedValue({ isConnected: true });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('aiConsentStepFor', () => {
  it('husket svar → inn, uten å lese og uten å spørre om nettet', async () => {
    await rememberAiConsentAnswered(USER);

    expect(await aiConsentStepFor(USER)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(networkMock).not.toHaveBeenCalled();
  });

  it('uten nett → inn, uten å lese', async () => {
    networkMock.mockResolvedValue({ isConnected: false });

    expect(await aiConsentStepFor(USER)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([true, false])('svart (%s) → inn, og neste oppstart leser ikke', async (granted) => {
    fetchMock.mockResolvedValue(granted);

    expect(await aiConsentStepFor(USER)).toBe(false);
    fetchMock.mockClear();
    expect(await aiConsentStepFor(USER)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ikke svart → spørsmålet', async () => {
    fetchMock.mockResolvedValue(null);

    expect(await aiConsentStepFor(USER)).toBe(true);
  });

  it('lesingen kaster → inn', async () => {
    fetchMock.mockRejectedValue(new Error('JWT expired'));

    expect(await aiConsentStepFor(USER)).toBe(false);
  });

  it('lesingen henger → inn når taket er nådd', async () => {
    jest.useFakeTimers();
    fetchMock.mockReturnValue(new Promise(() => {}));

    const answer = aiConsentStepFor(USER, { timeoutMs: 5_000 });
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(answer).resolves.toBe(false);
  });

  it('husker per bruker, ikke for hele enheten', async () => {
    await rememberAiConsentAnswered('en-annen');
    fetchMock.mockResolvedValue(null);

    expect(await aiConsentStepFor(USER)).toBe(true);
  });
});

// #2561: slettes kontoen i appen, skal enheten ikke huske svaret heller.
it('forgetAiConsentAnswers fjerner alle husket svar på enheten, og bare dem', async () => {
  await rememberAiConsentAnswered('a');
  await rememberAiConsentAnswered('b');
  await AsyncStorage.setItem('torny:noe-annet', '1');

  await forgetAiConsentAnswers();

  expect(await AsyncStorage.getAllKeys()).toEqual(['torny:noe-annet']);
});
