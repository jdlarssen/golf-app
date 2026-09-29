// #2256: «Personvern og konto» (Type C).
//
// Radene er flyttet uendret fra profilen, og testen følger med: e-posten står,
// personvernerklæringen åpner nettsiden (#2229) og sier hvorfor når det ikke
// går, og «Slett konto» bare navigerer til bekreftelsen.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { describeWebLinkFailure, openWeb } from '../lib/webLink';
import type { ScreenProps } from '../navigation';
import { AccountSettings } from './AccountSettings';

const mockEmail = 'spiller@example.com';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'user-me', email: mockEmail }),
}));
// Bare `openWeb` byttes ut: feilteksten skal komme fra den ekte
// `describeWebLinkFailure`, slik skjermen henter den.
jest.mock('../lib/webLink', () => ({
  ...jest.requireActual('../lib/webLink'),
  openWeb: jest.fn(),
}));

const openWebMock = openWeb as jest.Mock;
const navigate = jest.fn();

describe('AccountSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openWebMock.mockResolvedValue({ ok: true });
  });

  it('shows the e-mail, opens the privacy policy, and leads to the delete confirmation', async () => {
    await render(
      <AccountSettings
        {...({ navigation: { navigate }, route: { params: undefined } } as unknown as ScreenProps<'AccountSettings'>)}
      />,
    );

    expect(screen.getByTestId('account-email')).toHaveTextContent(mockEmail);

    await act(async () => {
      fireEvent.press(screen.getByTestId('account-privacy'));
    });
    expect(openWebMock).toHaveBeenCalledWith('/legal/privacy');
    expect(screen.queryByTestId('account-privacy-error')).toBeNull();

    // Mangler bygget adressen, sier raden det i stedet for å gjøre ingenting.
    openWebMock.mockResolvedValueOnce({ ok: false, reason: 'no-web-base-url' });
    await act(async () => {
      fireEvent.press(screen.getByTestId('account-privacy'));
    });
    expect(screen.getByTestId('account-privacy-error')).toHaveTextContent(
      describeWebLinkFailure('no-web-base-url'),
    );

    // Sletting bekreftes i sitt eget rom; raden her er bare inngangen.
    await fireEvent.press(screen.getByTestId('account-delete-entry'));
    expect(navigate).toHaveBeenCalledWith('DeleteAccount');
  });
});
