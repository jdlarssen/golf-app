// native/app/src/data/profileGate.test.ts
// #2216: avgjørelsen bak porten foran stacken — skal «Fullfør profilen» vises?
//
// Regelen er nettsidens (`profile_completed_at` mangler → steget), men appen er
// offline-først, så porten slipper deg inn ved tvil. Radene under er tvilen:
//
//  1. **Husket fullført → inn, uten å lese.** En profil som har vært fullført,
//     blir ikke ufullført igjen. Da venter ingen oppstart på nettet.
//  2. **Uten nett → inn, uten å lese.** Ekte nettstatus fra expo-network, ikke
//     sync-triggernes optimistiske flagg, som først settes etter Hjem.
//  3. **Fullført → inn, og husket.**
//  4. **Ikke fullført → steget.**
//  5. **Lesingen feiler eller henger → inn.** Taket gjør at en dårlig dekning
//     på banen aldri holder appen på en spinner.
//  6. **Lageret feiler → lesingen avgjør.**
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetworkStateAsync } from 'expo-network';
import { fetchOwnProfile, type OwnProfile } from './profile';
import { profileStepFor, rememberProfileComplete } from './profileGate';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock('expo-network', () => ({ getNetworkStateAsync: jest.fn() }));
jest.mock('./profile', () => ({ fetchOwnProfile: jest.fn() }));

const fetchOwnProfileMock = fetchOwnProfile as jest.Mock;
const networkMock = getNetworkStateAsync as jest.Mock;

function profile(profileCompletedAt: string | null): OwnProfile {
  return {
    name: 'Kari',
    nickname: null,
    hcpIndex: 18.4,
    handicapUpdatedAt: null,
    gender: null,
    level: 'normal',
    isAdmin: false,
    profileCompletedAt,
    createdAt: null,
  };
}

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

describe('profileStepFor', () => {
  it('husket fullført → inn, uten å lese og uten å spørre om nettet', async () => {
    await rememberProfileComplete(USER);

    expect(await profileStepFor(USER)).toBeNull();
    expect(fetchOwnProfileMock).not.toHaveBeenCalled();
    expect(networkMock).not.toHaveBeenCalled();
  });

  it('uten nett → inn, uten å lese', async () => {
    networkMock.mockResolvedValue({ isConnected: false });

    expect(await profileStepFor(USER)).toBeNull();
    expect(fetchOwnProfileMock).not.toHaveBeenCalled();
  });

  it('fullført → inn, og neste oppstart leser ikke', async () => {
    fetchOwnProfileMock.mockResolvedValue(profile('2026-09-30T10:00:00Z'));

    expect(await profileStepFor(USER)).toBeNull();
    fetchOwnProfileMock.mockClear();
    expect(await profileStepFor(USER)).toBeNull();
    expect(fetchOwnProfileMock).not.toHaveBeenCalled();
  });

  it('ikke fullført → steget, med profilen', async () => {
    const row = profile(null);
    fetchOwnProfileMock.mockResolvedValue(row);

    expect(await profileStepFor(USER)).toEqual(row);
  });

  it('lesingen kaster → inn', async () => {
    fetchOwnProfileMock.mockRejectedValue(new Error('JWT expired'));

    expect(await profileStepFor(USER)).toBeNull();
  });

  it('lesingen henger → inn når taket er nådd', async () => {
    jest.useFakeTimers();
    fetchOwnProfileMock.mockReturnValue(new Promise(() => {}));

    const answer = profileStepFor(USER, { timeoutMs: 5_000 });
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(answer).resolves.toBeNull();
  });

  it('kaster lageret, avgjør lesingen', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('storage'));
    const row = profile(null);
    fetchOwnProfileMock.mockResolvedValue(row);

    expect(await profileStepFor(USER)).toEqual(row);
  });

  it('husker per bruker, ikke for hele enheten', async () => {
    await rememberProfileComplete('en-annen');
    fetchOwnProfileMock.mockResolvedValue(profile(null));

    expect(await profileStepFor(USER)).not.toBeNull();
  });
});
