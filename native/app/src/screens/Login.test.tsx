// native/app/src/screens/Login.test.tsx
// Native #1954 (P1b): render-testene (Type C) for den skjulte passord-inngangen.
//
// To renders, to koblinger bare en render kan bekrefte:
//
//  1. **Feltet finnes ikke før langtrykket.** Ikke skjult, ikke deaktivert —
//     ikke i treet. Det er hele poenget med at inngangen er skjult, og det er
//     også det en reviewer må gjøre for å komme inn (notatet i
//     `docs/native/app-store-review-konto.md` beskriver nettopp dette trykket).
//  2. **Feilmeldingen er vår, ikke Supabases.** Hva enn `/auth/v1/token` svarte,
//     ser skjermen «Feil e-post eller passord.» — ingen konto-orakel.
//
// Overskriften leses fra `expo-constants`, som her er rigget til butikk-navnet:
// det beviser at skjermen ikke har «Tørny Dev» hardkodet.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LOGIN_TEXT } from '../lib/loginCopy';
import { supabase } from '../supabase';
import { Login } from './Login';

jest.mock('../supabase', () => require('../test/supabaseMock'));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { name: 'Tørny' } },
}));

const signInWithPasswordMock = supabase.auth.signInWithPassword as jest.Mock;

describe('Login — skjult passord-inngang', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('viser passordfeltet først når overskriften har vært holdt inne', async () => {
    await render(<Login />);

    expect(screen.getByTestId('login-heading')).toHaveTextContent('Tørny');
    expect(screen.queryByTestId('password-input')).toBeNull();
    expect(screen.queryByText(LOGIN_TEXT.passwordButton)).toBeNull();

    // `fireEvent` er asynkron i RNTL 14 — uten `await` er state-oppdateringen
    // ikke flushet når asserten leser treet.
    await fireEvent(screen.getByTestId('login-heading'), 'longPress');

    expect(screen.getByTestId('password-input')).toBeTruthy();
    expect(screen.getByText(LOGIN_TEXT.passwordButton)).toBeTruthy();
    // Kode-veien står fortsatt der — passordet er et tillegg, ikke en modus.
    expect(screen.getByTestId('email-input')).toBeTruthy();
  });

  it('sier det samme uansett hva Supabase svarte', async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    });
    await render(<Login />);
    await fireEvent(screen.getByTestId('login-heading'), 'longPress');

    await fireEvent.changeText(screen.getByTestId('email-input'), ' review@example.test ');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'hemmelig');
    await fireEvent.press(screen.getByTestId('password-login-button'));

    const error = await screen.findByTestId('login-error');
    expect(error).toHaveTextContent(LOGIN_TEXT.passwordFailed);
    expect(error).not.toHaveTextContent('Invalid');
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'review@example.test',
      password: 'hemmelig',
    });
  });
});
