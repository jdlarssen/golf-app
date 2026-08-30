// Native N1 (#1818): OTP-innloggingen, uendret — flyttet ut av `App.tsx` da
// N3 (#1825) satte inn en navigasjons-stack bak login-porten. Samme to steg
// (be om kode → skriv koden), samme testID-er som spike-beviset brukte.
//
// Ingen `next`-redirect og ingen dyplenker: appen har ingen URL å komme fra,
// og `onAuthStateChange` i `App.tsx` bytter til stacken av seg selv når
// `verifyOtp` har satt sesjonen.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '../supabase';
import { COLORS, ui } from '../theme';

export function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
    } else {
      setStep('code');
    }
  };

  const verifyCode = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (err) {
      setError(err.message);
    }
  };

  return (
    <View style={styles.screen} testID="login-screen">
      <StatusBar style="dark" />
      <Text style={styles.heading}>Tørny Dev</Text>
      {step === 'email' ? (
        <>
          <Text style={ui.body}>E-postadresse</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="email-input"
          />
          <Pressable style={ui.button} onPress={sendCode} disabled={busy}>
            <Text style={ui.buttonText}>{busy ? 'Sender …' : 'Send meg kode'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={ui.body}>Kode fra e-posten</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            testID="code-input"
          />
          <Pressable style={ui.button} onPress={verifyCode} disabled={busy}>
            <Text style={ui.buttonText}>{busy ? 'Sjekker …' : 'Logg inn'}</Text>
          </Pressable>
          <Pressable style={ui.link} onPress={() => setStep('email')}>
            <Text style={ui.linkText}>Tilbake</Text>
          </Pressable>
        </>
      )}
      {error ? (
        <Text style={styles.error} testID="login-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.linen,
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.forest,
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.forest,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    backgroundColor: COLORS.card,
  },
  error: { color: COLORS.error, fontSize: 15, textAlign: 'center' },
});
