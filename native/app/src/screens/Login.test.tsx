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
//
// #1923 la til én render til: boksen med testbrukere i et staging-bygg, og at
// et trykk på en rad logger inn med radens e-post og byggets passord. Gaten
// selv (prod-vert, manglende passord) er Type A i `devLogin.test.ts`.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DEV_LOGIN_TEXT } from '../devLogin';
import { LOGIN_TEXT } from '../lib/loginCopy';
import { STAGING_SUPABASE_HOST } from '../lib/stagingGate';
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

describe('Login — testbrukere i staging-bygget (#1923)', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_SUPABASE_URL = `https://${STAGING_SUPABASE_HOST}`;
    process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD = 'staging-testpassord';
    global.fetch = jest.fn(async () => ({
      status: 200,
      json: async () => ({
        version: 1,
        users: [
          { email: 'kari@example.test', label: 'Kari Arrangør', role: 'arrangor' },
          { email: 'ola@example.test', label: 'Ola Kompis', role: 'spiller' },
        ],
      }),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_DEV_LOGIN_PASSWORD;
  });

  it('viser en rad per testbruker, og et trykk logger inn som den', async () => {
    signInWithPasswordMock.mockResolvedValue({ data: {}, error: null });
    await render(<Login />);

    const section = await screen.findByTestId('dev-login-section');
    expect(section).toHaveTextContent(DEV_LOGIN_TEXT.sectionTitle, { exact: false });
    expect(screen.getByTestId('dev-login-user-0')).toHaveTextContent('Kari Arrangør', {
      exact: false,
    });
    expect(screen.getByTestId('dev-login-user-0')).toHaveTextContent('Arrangør', {
      exact: false,
    });
    expect(screen.getByTestId('dev-login-user-1')).toHaveTextContent('Ola Kompis', {
      exact: false,
    });
    expect(screen.queryByTestId('dev-login-user-2')).toBeNull();
    // Skjemaet står fortsatt under boksen.
    expect(screen.getByTestId('email-input')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('dev-login-user-0'));

    expect(signInWithPasswordMock).toHaveBeenCalledTimes(1);
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: 'kari@example.test',
      password: 'staging-testpassord',
    });
  });
});
