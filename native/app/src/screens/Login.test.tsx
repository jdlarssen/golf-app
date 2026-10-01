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
//
// #2216 la til én render til: koden bes om gjennom nettsidens rute
// (`requestLoginCode`), e-posten trimmes og gjøres liten én gang, feilen fra
// ruta vises med appens setning, og etter `verifyOtp` kjøres stegene etter
// innloggingen (`finishLogin`). Koden sendes av seg selv når alle sifrene står
// der. Hvilken kode ruta svarer, og hva den betyr, er Type A i
// `data/loginCode.test.ts`.
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock-fabrikkene heises over importene og må bruke require */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DEV_LOGIN_TEXT } from '../devLogin';
import { finishLogin, requestLoginCode } from '../data/loginCode';
import { LOGIN_TEXT, OTP_LENGTH, describeLoginError } from '../lib/loginCopy';
import { STAGING_SUPABASE_HOST } from '../lib/stagingGate';
import { supabase } from '../supabase';
import { Login } from './Login';

jest.mock('../supabase', () => require('../test/supabaseMock'));
// Båndet leser innfellingen (#2216). Uten app-rotas SafeAreaProvider gir
// pakkens egen mock innfelling 0, som i `Home.test.tsx`.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { name: 'Tørny' } },
}));
// Ruta og stegene etter innloggingen byttes ut; regelen for kode-steget
// (`landsOnCodeStep`) er den ekte.
jest.mock('../data/loginCode', () => ({
  ...jest.requireActual('../data/loginCode'),
  requestLoginCode: jest.fn(),
  finishLogin: jest.fn(),
}));

const signInWithPasswordMock = supabase.auth.signInWithPassword as jest.Mock;
const verifyOtpMock = supabase.auth.verifyOtp as jest.Mock;
const requestLoginCodeMock = requestLoginCode as jest.Mock;
const finishLoginMock = finishLogin as jest.Mock;

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

describe('Login: ny konto gjennom nettsidens sperrer (#2216)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    finishLoginMock.mockResolvedValue(undefined);
  });

  it('ber om koden gjennom ruta, viser feilen, og kjører stegene etter innloggingen', async () => {
    requestLoginCodeMock.mockResolvedValueOnce({ ok: false, code: 'user_not_found' });
    await render(<Login />);

    await fireEvent.changeText(screen.getByTestId('email-input'), ' Ny@Example.TEST ');
    await fireEvent.press(screen.getByTestId('send-code-button'));

    expect(requestLoginCodeMock).toHaveBeenCalledWith('ny@example.test');
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      describeLoginError('user_not_found'),
    );
    // Avslaget holder deg på e-post-steget.
    expect(screen.queryByTestId('code-input')).toBeNull();

    requestLoginCodeMock.mockResolvedValueOnce({ ok: true });
    verifyOtpMock.mockResolvedValue({ data: {}, error: null });
    await fireEvent.press(screen.getByTestId('send-code-button'));

    const codeInput = await screen.findByTestId('code-input');
    // Ett siffer for lite: ingenting sendes, og «Logg inn» venter.
    await fireEvent.changeText(codeInput, '1234567');
    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('verify-code-button')).toBeDisabled();

    // Alle sifrene på plass sender koden av seg selv. Limt inn med mellomrom,
    // slik koden kan stå i mailen: bare sifrene teller.
    expect(OTP_LENGTH).toBe(8);
    await fireEvent.changeText(codeInput, '1234 5678');
    await waitFor(() => expect(finishLoginMock).toHaveBeenCalledTimes(1));
    expect(verifyOtpMock).toHaveBeenCalledTimes(1);
    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: 'ny@example.test',
      token: '12345678',
      type: 'email',
    });
  });
});

