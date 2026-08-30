// Native spike: three screens, no polish. N1 (#1818) proved (1) shared
// lib/scoring source consumed straight from the repo, (2) Supabase OTP login
// against staging with a session that survives relaunch. N2 (#1823) adds the
// Sync-lab screen — the local-first data layer made visible.
import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Session } from '@supabase/supabase-js';
// Shared brain: same source files as the web app — no copies. The index
// import pulls the full mode-router graph (23 modes) through Metro.
import { computeLeaderboard } from '../../lib/scoring';
import { calculateCourseHandicap } from '../../lib/scoring/courseHandicap';
import { SyncLab } from './src/SyncLab';
import { supabase } from './src/supabase';

// Demo inputs for the shared-source proof: WHS course handicap.
const DEMO = { hcpIndex: 12.4, slope: 128, courseRating: 71.2, par: 72 };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Third screen (#1823). Navigation state is one field — a router is more
  // machinery than a spike with three screens earns.
  const [screen, setScreen] = useState<'home' | 'lab'>('home');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setBooting(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

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

  if (booting) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator color="#1B4332" />
      </View>
    );
  }

  if (session && screen === 'lab') {
    return (
      <>
        <StatusBar style="dark" />
        <SyncLab
          userId={session.user.id}
          onBack={() => setScreen('home')}
        />
      </>
    );
  }

  if (session) {
    const courseHandicap = calculateCourseHandicap(DEMO);
    const sharedLoaded = typeof computeLeaderboard === 'function';
    return (
      <View style={styles.screen} testID="home-screen">
        <StatusBar style="dark" />
        <Text style={styles.title}>Tørny Dev</Text>
        <Text style={styles.body}>Innlogget som</Text>
        <Text style={styles.value} testID="session-email">
          {session.user.email}
        </Text>
        <View style={styles.card}>
          <Text style={styles.body}>Delt scoring-motor lastet: {sharedLoaded ? '✓' : '✗'}</Text>
          <Text style={styles.body}>
            Banehandicap (indeks {DEMO.hcpIndex}, slope {DEMO.slope}, CR {DEMO.courseRating}, par{' '}
            {DEMO.par}):
          </Text>
          <Text style={styles.value} testID="course-handicap">
            {courseHandicap}
          </Text>
        </View>
        <Pressable
          style={styles.button}
          onPress={() => setScreen('lab')}
          testID="open-sync-lab"
        >
          <Text style={styles.buttonText}>Åpne sync-lab</Text>
        </Pressable>
        <Pressable
          style={styles.buttonSecondary}
          onPress={() => {
            setScreen('home');
            void supabase.auth.signOut();
          }}
        >
          <Text style={styles.buttonSecondaryText}>Logg ut</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="login-screen">
      <StatusBar style="dark" />
      <Text style={styles.title}>Tørny Dev</Text>
      {step === 'email' ? (
        <>
          <Text style={styles.body}>E-postadresse</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="email-input"
          />
          <Pressable style={styles.button} onPress={sendCode} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Sender …' : 'Send meg kode'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.body}>Kode fra e-posten</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            testID="code-input"
          />
          <Pressable style={styles.button} onPress={verifyCode} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? 'Sjekker …' : 'Logg inn'}</Text>
          </Pressable>
          <Pressable style={styles.buttonSecondary} onPress={() => setStep('email')}>
            <Text style={styles.buttonSecondaryText}>Tilbake</Text>
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
    backgroundColor: '#F8F6F0',
    alignItems: 'stretch',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1B4332',
    textAlign: 'center',
    marginBottom: 16,
  },
  body: { fontSize: 16, color: '#1B4332' },
  value: { fontSize: 22, fontWeight: '700', color: '#1B4332' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    gap: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#1B4332',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    backgroundColor: '#FFFFFF',
  },
  button: {
    backgroundColor: '#1B4332',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  buttonSecondary: { padding: 12, alignItems: 'center' },
  buttonSecondaryText: { color: '#1B4332', fontSize: 15 },
  error: { color: '#B00020', fontSize: 15, textAlign: 'center' },
});
