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
import { useState } from 'react';
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
import { supabase } from '../supabase';
import { FONTS, useTheme } from '../theme';

/** Hvilken knapp som venter på Supabase — de tre veiene deler ett felt. */
type Busy = 'code' | 'password' | null;

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
});
