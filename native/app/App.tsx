// Native app-rota: sesjonen, login-porten og font-lasting — ingenting annet.
//
// N1 (#1818) beviste delt hjerne + OTP mot staging, N2 (#1823) datalaget, og
// N3 (#1825) satte spillerflatene på en react-navigation-stack. Rota har derfor
// bare to tilstander igjen: uten sesjon vises Login, med sesjon vises stacken.
// Alt navigasjonen trenger å vite om HVEM som er logget inn går gjennom
// `SessionProvider`.
//
// #1830: Fraunces/Inter lastes med `useFonts`, og splashen står til BÅDE
// fontene og sesjons-sjekken er ferdig — ingen font-hopp og ingen
// spinner-blits ved kaldstart. Font-feil slipper appen videre på systemfonter
// (aldri heng på splash).
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import type { Session } from '@supabase/supabase-js';
import { RootNavigator } from './src/navigation';
import { Login } from './src/screens/Login';
import { SessionProvider } from './src/session';
import { supabase } from './src/supabase';
import { useTheme } from './src/theme';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const { colors, ui } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [fontsLoaded, fontsError] = useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

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

  const ready = (fontsLoaded || fontsError != null) && !booting;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    // Bak splashen — synlig kun hvis hideAsync taper et kappløp med render.
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.primary} />
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
