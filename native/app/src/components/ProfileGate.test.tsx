// native/app/src/components/ProfileGate.test.tsx
// #2216: porten foran stacken som sender en spiller uten fullført profil til
// «Fullfør profilen» (Type C).
//
// Hva porten avgjør (husket, uten nett, feil, tak) er Type A i
// `data/profileGate.test.ts`. Her sjekkes koblingen bare en render kan
// bekrefte: svaret derfra bytter mellom steget og appen, og porten leser først
// etter at stegene etter innloggingen er ferdige.
//
// Selve steget er byttet ut med en markør: det har sin egen test.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { afterLoginSettled } from '../data/loginCode';
import { profileStepFor } from '../data/profileGate';
import { ProfileGate } from './ProfileGate';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/profileGate', () => ({
  profileStepFor: jest.fn(),
  rememberProfileComplete: jest.fn(),
}));
jest.mock('../data/loginCode', () => ({ afterLoginSettled: jest.fn() }));
jest.mock('../screens/CompleteProfile', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  return {
    CompleteProfile: () => createElement(View, { testID: 'complete-profile-screen' }),
  };
});

const profileStepForMock = profileStepFor as jest.Mock;

const INCOMPLETE = {
  name: null,
  nickname: null,
  hcpIndex: 54,
  handicapUpdatedAt: null,
  gender: null,
  level: 'normal',
  isAdmin: false,
  profileCompletedAt: null,
  createdAt: null,
};

describe('ProfileGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    { label: 'ikke fullført → steget', step: INCOMPLETE, shows: 'step' },
    { label: 'ingen grunn til steget → appen', step: null, shows: 'app' },
  ])('$label, først når stegene etter innloggingen er ferdige', async ({ step, shows }) => {
    // Rekkefølgen er hele grunnen til `afterLoginSettled`: leser porten før den
    // inviterte står på lista, mangler spillet på kortet og på Hjem.
    let settle: () => void = () => {};
    (afterLoginSettled as jest.Mock).mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    profileStepForMock.mockResolvedValue(step);

    await render(
      <ProfileGate userId="user-me">
        <Text testID="app-stack">Appen</Text>
      </ProfileGate>,
    );
    expect(profileStepForMock).not.toHaveBeenCalled();

    await act(async () => {
      settle();
    });

    if (shows === 'app') {
      await waitFor(() => expect(screen.getByTestId('app-stack')).toBeTruthy());
      expect(screen.queryByTestId('complete-profile-screen')).toBeNull();
    } else {
      await waitFor(() => expect(screen.getByTestId('complete-profile-screen')).toBeTruthy());
      expect(screen.queryByTestId('app-stack')).toBeNull();
    }
    expect(profileStepForMock).toHaveBeenCalledTimes(1);
    expect(profileStepForMock).toHaveBeenCalledWith('user-me');
  });
});
