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
//
// #1942: eier-vakten. Sesjonen alene er ikke nok til å montere stacken — den
// lokale basen må tilhøre den som logget inn. Vakten (`data/localOwner.ts`)
// kjører i det sesjonen er kjent og FØR stacken, slik at `startSyncTriggers`
// (som Hjem starter) aldri rekker å draine forrige brukers kø under feil
// sesjon. Porten (`OwnerGate`) monteres på nytt per bruker via `key`, så
// «ikke sjekket» er startverdien hver gang — ingen effekt trenger å nullstille.
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
// Per-vekt-subpath, ikke pakke-rota: index-fila require-er ALLE snitt og
// kursiver (~15 MB TTF-er inn i bundelen). Kun de seks vi bruker skal med.
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import type { Session } from '@supabase/supabase-js';
import { ensureLocalDataOwnerOnDevice } from './src/data/localOwner';
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
    // .catch + .finally: en avvist getSession må ALDRI la splashen henge —
    // uten sesjon faller vi til Login, som selv viser feil ved ny innlogging.
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setBooting(false));
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
    <OwnerGate key={session.user.id} userId={session.user.id}>
      <SessionProvider
        value={{ userId: session.user.id, email: session.user.email ?? null }}
      >
        {/* «auto» følger systemets lys/mørk (#1833): mørk tekst på lys app, lys
            tekst på mørk. «dark» var en midlertidig sannhet mens skjermene bare
            fantes i lys drakt. */}
        <StatusBar style="auto" />
        <RootNavigator />
      </SessionProvider>
    </OwnerGate>
  );
}

/**
 * Eier-vakten (#1942) mellom sesjonen og stacken.
 *
 * Barna — og dermed `startSyncTriggers` i Hjem — rendres ikke før vakten har
 * svart. Kalleren setter `key={userId}`, så porten monteres på nytt for hver
 * bruker og starter alltid som «ikke sjekket»; det er derfor ingen effekt
 * trenger å nullstille noe når sesjonen bytter.
 */
function OwnerGate({ userId, children }: { userId: string; children: ReactNode }) {
  const { colors, ui } = useTheme();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureLocalDataOwnerOnDevice(userId)
      .catch((err: unknown) => {
        // Vakten er defensiv (som webbens SyncBoot): feiler den, logges det og
        // appen går videre. Stempelet peker fortsatt på forrige eier, så neste
        // oppstart prøver wipen igjen.
        console.error('[App] eier-vakten feilet', err);
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!checked) {
    // Millisekundene AsyncStorage bruker — og en wipe, den ene gangen det er
    // en annen bruker.
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}
