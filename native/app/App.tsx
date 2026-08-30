// Native app-rota: sesjonen og login-porten, ingenting annet.
//
// N1 (#1818) beviste delt hjerne + OTP mot staging, N2 (#1823) datalaget, og
// N3 (#1825) satte spillerflatene på en react-navigation-stack. Rota har derfor
// bare to tilstander igjen: uten sesjon vises Login, med sesjon vises stacken.
// Alt navigasjonen trenger å vite om HVEM som er logget inn går gjennom
// `SessionProvider`.
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { RootNavigator } from './src/navigation';
import { Login } from './src/screens/Login';
import { SessionProvider } from './src/session';
import { supabase } from './src/supabase';
import { COLORS, ui } from './src/theme';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

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

  if (booting) {
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={COLORS.forest} />
      </View>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <SessionProvider
      value={{ userId: session.user.id, email: session.user.email ?? null }}
    >
      <StatusBar style="dark" />
      <RootNavigator />
    </SessionProvider>
  );
}
