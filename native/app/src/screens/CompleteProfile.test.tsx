// native/app/src/screens/CompleteProfile.test.tsx
// #2216: «Fullfør profilen», steget en ny spiller møter etter koden (Type C).
//
// Én render, koblingene bare en render kan bekrefte:
//
//  1. **Spillkortet står når du er på et spill.** Hvilket spill er Type A i
//     `data/onboardingGame.test.ts`.
//  2. **Forhåndsvisningen følger det du skriver**, også «+».
//  3. **Lagringen skriver ikke over det steget ikke viser.** Kallenavnet og
//     klassen som alt står på raden går uendret til serveren, og kjønn sendes
//     som `null` («la stå»). Samme grunn som i `lib/users/profileInput.ts`.
//  4. **En avvist lagring sier hvorfor, og neste forsøk slipper deg inn.**
//
// Tekstene er Type A i `lib/profileCopy.test.ts`; her hentes de gjennom de
// samme funksjonene skjermen bruker.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { fetchOnboardingGame } from '../data/onboardingGame';
import { saveProfile, type OwnProfile } from '../data/profile';
import {
  describeProfileSaveFailure,
  onboardingGameTitle,
  onboardingPreviewHcp,
} from '../lib/profileCopy';
import { CompleteProfile } from './CompleteProfile';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../data/profile', () => ({
  ...jest.requireActual('../data/profile'),
  saveProfile: jest.fn(),
}));
jest.mock('../data/onboardingGame', () => ({ fetchOnboardingGame: jest.fn() }));
// Skjermen leser innfellingen. Uten app-rotas SafeAreaProvider gir pakkens
// egen mock innfelling 0, som i `Home.test.tsx`.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

const saveProfileMock = saveProfile as jest.Mock;

const PROFILE: OwnProfile = {
  name: null,
  nickname: 'Kalle',
  hcpIndex: 54,
  handicapUpdatedAt: null,
  gender: null,
  level: 'senior',
  isAdmin: false,
  profileCompletedAt: null,
  createdAt: null,
};

describe('CompleteProfile', () => {
  it('viser spillet, følger det du skriver, og lagrer uten å skrive over kallenavn og klasse', async () => {
    (fetchOnboardingGame as jest.Mock).mockResolvedValue({
      gameId: 'game-1',
      name: 'Lørdagsrunden',
      courseName: 'Byneset',
      teeOffAt: '2026-10-04T07:20:00Z',
      gameMode: 'stableford',
    });
    const onDone = jest.fn();
    await render(<CompleteProfile userId="user-me" profile={PROFILE} onDone={onDone} />);

    expect(screen.getByTestId('complete-profile-screen')).toBeTruthy();
    expect(await screen.findByTestId('complete-profile-game')).toHaveTextContent(
      onboardingGameTitle('Lørdagsrunden'),
      { exact: false },
    );

    await fireEvent.changeText(screen.getByTestId('complete-profile-name'), 'Kari Nordmann');
    await fireEvent.changeText(screen.getByTestId('complete-profile-hcp'), '2,5');
    await fireEvent.press(screen.getByTestId('complete-profile-hcp-plus'));

    expect(screen.getByTestId('complete-profile-preview-name')).toHaveTextContent('Kari Nordmann');
    expect(screen.getByTestId('complete-profile-preview-hcp')).toHaveTextContent(
      onboardingPreviewHcp('2,5', true),
    );

    saveProfileMock.mockResolvedValueOnce({ ok: false, reason: 'hcp_invalid' });
    await fireEvent.press(screen.getByTestId('complete-profile-submit'));

    expect(saveProfileMock).toHaveBeenCalledWith({
      name: 'Kari Nordmann',
      nickname: 'Kalle',
      hcpIndex: '2,5',
      hcpPlus: true,
      gender: null,
      level: 'senior',
    });
    expect(await screen.findByTestId('complete-profile-error')).toHaveTextContent(
      describeProfileSaveFailure('hcp_invalid'),
    );
    expect(onDone).not.toHaveBeenCalled();

    saveProfileMock.mockResolvedValueOnce({ ok: true });
    await fireEvent.press(screen.getByTestId('complete-profile-submit'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });
});
