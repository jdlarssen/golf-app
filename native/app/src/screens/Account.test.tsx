// native/app/src/screens/Account.test.tsx
// Native #1876: den ene render-testen (Type C) for kontoflata.
//
// Skjermen har ingen logikk å teste — den viser sesjonen og har to utganger.
// Det som er verdt å låse er nettopp de utgangene: at e-posten faktisk står der
// (App Review skal se hvilken konto de er logget inn på), at «Slett konto» går
// til bekreftelsesskjermen og ikke sletter noe selv, og at utloggingen finnes
// her uten at hjem-footeren mistet sin.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ScreenProps } from '../navigation';
import { supabase } from '../test/supabaseMock';
import { Account } from './Account';

// `mock`-prefiks kreves: bare navn som starter med «mock» slipper inn i en
// heist jest.mock-fabrikk.
const mockEmail = 'spiller@example.com';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('../session', () => ({
  useSession: () => ({ userId: 'user-me', email: mockEmail }),
}));

describe('Account', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('viser e-posten, logger ut og sender «Slett konto» til bekreftelsen', async () => {
    const navigate = jest.fn();
    await render(
      <Account
        {...({ navigation: { navigate } } as unknown as ScreenProps<'Account'>)}
      />,
    );

    expect(screen.getByTestId('account-email')).toHaveTextContent(mockEmail);

    // Inngangen navigerer — den sletter ingenting selv. Bekreftelsen er et eget
    // rom, og det er der den røde knappen bor.
    await fireEvent.press(screen.getByTestId('account-delete-entry'));
    expect(navigate).toHaveBeenCalledWith('DeleteAccount');
    expect(supabase.auth.signOut).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('account-sign-out'));
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
