// native/app/src/components/ProfileGate.test.tsx
// #2216: porten foran stacken som sender en spiller uten fullført profil til
// «Fullfør profilen» (Type C).
//
// Fire tilfeller, én render hver:
//
//  1. **Fullført profil → appen.** Porten er usynlig for alle som har vært
//     gjennom steget.
//  2. **Ikke fullført → steget.** Samme regel som nettsidens `/`
//     (`profile_completed_at` mangler).
//  3. **Lesingen feiler → appen.** Appen er offline-først, og en runde skal
//     aldri stoppe på en profilsjekk. Steget kommer neste gang appen får svar.
//  4. **Uten nett → appen, og raden leses ikke.** Ingen vits i å spørre.
//
// Selve steget er byttet ut med en markør: det har sin egen test.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { afterLoginSettled } from '../data/loginCode';
import { fetchOwnProfile } from '../data/profile';
import { isDeviceOnline } from '../data/syncTriggers';
import { ProfileGate } from './ProfileGate';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/profile', () => ({ fetchOwnProfile: jest.fn() }));
jest.mock('../data/syncTriggers', () => ({ isDeviceOnline: jest.fn() }));
jest.mock('../data/loginCode', () => ({ afterLoginSettled: jest.fn() }));
jest.mock('../screens/CompleteProfile', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  return {
    CompleteProfile: () => createElement(View, { testID: 'complete-profile-screen' }),
  };
});

const fetchOwnProfileMock = fetchOwnProfile as jest.Mock;
const isDeviceOnlineMock = isDeviceOnline as jest.Mock;

function profile(profileCompletedAt: string | null) {
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

type Case = {
  label: string;
  online: boolean;
  read: () => Promise<unknown>;
  shows: 'app' | 'step';
};

describe('ProfileGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (afterLoginSettled as jest.Mock).mockResolvedValue(undefined);
  });

  it.each<Case>([
    {
      label: 'fullført profil → appen',
      online: true,
      read: async () => profile('2026-09-30T10:00:00Z'),
      shows: 'app',
    },
    {
      label: 'ikke fullført → steget',
      online: true,
      read: async () => profile(null),
      shows: 'step',
    },
    {
      label: 'lesingen kaster → appen',
      online: true,
      read: async () => {
        throw new Error('JWT expired');
      },
      shows: 'app',
    },
    {
      label: 'uten nett → appen, uten å lese',
      online: false,
      read: async () => profile(null),
      shows: 'app',
    },
  ])('$label', async ({ online, read, shows }) => {
    isDeviceOnlineMock.mockReturnValue(online);
    fetchOwnProfileMock.mockImplementation(read);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await render(
      <ProfileGate userId="user-me">
        <Text testID="app-stack">Appen</Text>
      </ProfileGate>,
    );

    if (shows === 'app') {
      await waitFor(() => expect(screen.getByTestId('app-stack')).toBeTruthy());
      expect(screen.queryByTestId('complete-profile-screen')).toBeNull();
    } else {
      await waitFor(() => expect(screen.getByTestId('complete-profile-screen')).toBeTruthy());
      expect(screen.queryByTestId('app-stack')).toBeNull();
    }
    if (!online) expect(fetchOwnProfileMock).not.toHaveBeenCalled();
  });
});
