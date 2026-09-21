// Native N1 (#1818): OTP-innloggingen, uendret — flyttet ut av `App.tsx` da
// N3 (#1825) satte inn en navigasjons-stack bak login-porten. Samme to steg
// (be om kode → skriv koden), samme testID-er som spike-beviset brukte.
//
// Ingen `next`-redirect og ingen dyplenker: appen har ingen URL å komme fra,
// og `onAuthStateChange` i `App.tsx` bytter til stacken av seg selv når
// `verifyOtp` har satt sesjonen.
//
// #1954 (P1b): en skjult passord-inngang for App Review. Holdes overskriften
// inne i halvannet sekund, dukker et passordfelt og «Logg inn med passord» opp
// under e-postfeltet. Ingen env-gate og ingen e-post-sjekk i appen — inngangen
// må virke i butikk-bygget, der webbens `REVIEW_ACCOUNT_EMAIL`-port ikke
// finnes. Sperren er den samme som alt gjelder for direkte kall mot
// `/auth/v1/token`: Supabases rate-limit pluss et 28-tegns tilfeldig passord,
// og bare review-kontoen har et passord i det hele tatt. `signInWithPassword`
// kan aldri opprette en konto, og OTP-veien beholder `shouldCreateUser: false`.
//
// Overskriften er app-navnet fra den oppløste configen (`expo-constants`), ikke
// en streng her: «Tørny Dev» i dev-bygget, «Tørny» når butikk-varianten (P2)
// setter navnet.
//
// #1923: i Tørny Dev mot staging står en boks «Testbrukere (staging)» over
// skjemaet — ett trykk på et navn logger inn som den testbrukeren. Gaten og
// lista bor i `devLogin.ts`; i alle andre bygg er `devConfig` null, ingenting
// hentes og skjermen er som før.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import {
  APP_NAME_FALLBACK,
  LOGIN_TEXT,
  REVEAL_PASSWORD_LOGIN_MS,
  classifyLoginError,
  describeLoginError,
} from '../lib/loginCopy';
import {
  DEV_LOGIN_ROLE_LABEL,
  DEV_LOGIN_TEXT,
  fetchDevLoginUsers,
  readDevLoginEnv,
  resolveDevLoginConfig,
  signInAsDevUser,
  type DevLoginUser,
} from '../devLogin';
import { supabase } from '../supabase';
import { FONTS, useTheme } from '../theme';

/** Hvilken knapp som venter på Supabase — alle veiene deler ett felt. */
type Busy = 'code' | 'password' | 'dev' | null;

export function Login() {
  const { colors, ui } = useTheme();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  // Vises først etter langtrykket, og går ikke tilbake: en reviewer som fikk
  // feltet fram skal ikke miste det på et ekstra trykk.
  const [passwordMode, setPasswordMode] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  // Løses én gang per montering: env er bakt inn i bundelen og endrer seg ikke.
  const [devConfig] = useState(() => resolveDevLoginConfig(readDevLoginEnv()));
  const [devUsers, setDevUsers] = useState<DevLoginUser[]>([]);

  useEffect(() => {
    if (!devConfig) return;
    const controller = new AbortController();
    fetchDevLoginUsers(devConfig, controller.signal).then((users) => {
      if (!controller.signal.aborted) setDevUsers(users);
    });
    return () => controller.abort();
  }, [devConfig]);

  // `color` settes EKSPLISITT: `TextInput` tegner ellers svart tekst uansett
  // palett, og i mørk modus blir feltet uleselig (samme regel som `ui.input`).
  const inputColors = {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    color: colors.text,
  };

  const sendCode = async () => {
    const trimmed = email.trim();
    // Ingen tur til Supabase på et tomt felt: svaret derfra («One of email or
    // phone must be set») sier ikke det spilleren trenger å høre.
    if (!trimmed) {
      setError(LOGIN_TEXT.emailRequired);
      return;
    }
    setBusy('code');
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: false },
    });
    setBusy(null);
    if (err) {
      setError(describeLoginError(classifyLoginError('send-code', err)));
    } else {
      setStep('code');
    }
  };

  const verifyCode = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError(LOGIN_TEXT.codeRequired);
      return;
    }
    setBusy('code');
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: trimmed,
      type: 'email',
    });
    setBusy(null);
    if (err) {
      setError(describeLoginError(classifyLoginError('verify-code', err)));
    }
  };

  const signInWithPassword = async () => {
    setBusy('password');
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(null);
    // Én melding uansett årsak, aldri Supabases tekst: ukjent adresse, konto
    // uten passord og feil passord skal være umulige å skille fra hverandre.
    if (err) {
      setError(LOGIN_TEXT.passwordFailed);
    }
  };

  const signInAsDev = async (user: DevLoginUser) => {
    if (!devConfig) return;
    setBusy('dev');
    setError(null);
    const { error: err } = await signInAsDevUser(user, devConfig);
    // Ved suksess bytter `App.tsx` til stacken; skjermen avmonteres.
    if (err) {
      setError(err);
      setBusy(null);
    }
  };

  return (
    <View
      style={[styles.screen, { backgroundColor: colors.bg }]}
      testID="login-screen"
    >
      {/* «auto» følger systemets lys/mørk — samme valg som `App.tsx`. */}
      <StatusBar style="auto" />
      <Pressable
        onLongPress={() => setPasswordMode(true)}
        delayLongPress={REVEAL_PASSWORD_LOGIN_MS}
        accessibilityRole="header"
        testID="login-heading"
      >
        <Text style={[styles.heading, { color: colors.text }]}>
          {Constants.expoConfig?.name ?? APP_NAME_FALLBACK}
        </Text>
      </Pressable>
      {step === 'email' && devConfig && devUsers.length > 0 ? (
        <View testID="dev-login-section" style={styles.devSection}>
          <Text style={ui.sectionTitle}>{DEV_LOGIN_TEXT.sectionTitle}</Text>
          {devUsers.map((user, index) => (
            <Pressable
              key={user.email}
              style={[ui.buttonSecondary, styles.devRow]}
              onPress={() => signInAsDev(user)}
              disabled={busy != null}
              accessibilityRole="button"
              accessibilityLabel={DEV_LOGIN_TEXT.signInLabel(user.label)}
              testID={`dev-login-user-${index}`}
            >
              <Text style={ui.buttonSecondaryText}>{user.label}</Text>
              <View style={[ui.badge, styles.devBadge]}>
                <Text style={ui.badgeText}>{DEV_LOGIN_ROLE_LABEL[user.role]}</Text>
              </View>
            </Pressable>
          ))}
          <Text style={[ui.muted, styles.devDivider]}>{DEV_LOGIN_TEXT.divider}</Text>
        </View>
      ) : null}
      {step === 'email' ? (
        <>
          <Text style={ui.body}>E-postadresse</Text>
          <TextInput
            style={[styles.input, inputColors]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="email-input"
          />
          <Pressable style={ui.button} onPress={sendCode} disabled={busy != null}>
            <Text style={ui.buttonText}>
              {busy === 'code' ? 'Sender …' : 'Send meg kode'}
            </Text>
          </Pressable>
          {passwordMode ? (
            <>
              <Text style={ui.body}>{LOGIN_TEXT.passwordLabel}</Text>
              <TextInput
                style={[styles.input, inputColors]}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                testID="password-input"
              />
              <Pressable
                style={ui.button}
                onPress={signInWithPassword}
                disabled={busy != null}
                testID="password-login-button"
              >
                <Text style={ui.buttonText}>
                  {busy === 'password'
                    ? LOGIN_TEXT.passwordPending
                    : LOGIN_TEXT.passwordButton}
                </Text>
              </Pressable>
            </>
          ) : null}
        </>
      ) : (
        <>
          <Text style={ui.body}>Kode fra e-posten</Text>
          <TextInput
            style={[styles.input, inputColors]}
            autoCapitalize="none"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            testID="code-input"
          />
          <Pressable style={ui.button} onPress={verifyCode} disabled={busy != null}>
            <Text style={ui.buttonText}>
              {busy === 'code' ? 'Sjekker …' : 'Logg inn'}
            </Text>
          </Pressable>
          <Pressable style={ui.link} onPress={() => setStep('email')}>
            <Text style={ui.linkText}>Tilbake</Text>
          </Pressable>
        </>
      )}
      {error ? (
        <Text style={[styles.error, { color: colors.danger }]} testID="login-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  heading: {
    // Egen familie, ikke `fontWeight`: expo-font registrerer ett snitt per
    // familie, og en vekt oppå den ville ikke valgt noe snitt.
    fontFamily: FONTS.serifScore,
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
  },
  error: { fontSize: 15, textAlign: 'center' },
  devSection: { gap: 8, marginBottom: 8 },
  devRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // `gap` i seksjonen står for luften; knappens egen marginTop ville doblet den.
    marginTop: 0,
  },
  devBadge: { alignSelf: 'center' },
  devDivider: { textAlign: 'center', marginTop: 4 },
});
