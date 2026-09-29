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
// (aldri heng på splash). Splashen venter også på de to valgene som bor på
// telefonen: sollys (#2252), så en hullside i sollys aldri blinker mørk ved
// åpning, og temaet (#2256: «Lys», «Mørk», «Følg telefonen»), så appen aldri
// blinker i feil drakt ved oppstart.
//
// #1942: eier-vakten. Sesjonen alene er ikke nok til å montere stacken — den
// lokale basen må tilhøre den som logget inn. Vakten (`data/localOwner.ts`)
// kjører i det sesjonen er kjent og FØR stacken, slik at `startSyncTriggers`
// (som Hjem starter) aldri rekker å draine forrige brukers kø under feil
// sesjon. Porten (`OwnerGate`) monteres på nytt per bruker via `key`, så
// «ikke sjekket» er startverdien hver gang — ingen effekt trenger å nullstille.
import { useEffect, useState } from 'react';
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
import { OwnerGate } from './src/components/OwnerGate';
import { RootNavigator } from './src/navigation';
import { Login } from './src/screens/Login';
import { applyStoredThemePreference } from './src/lib/themePreference';
import { SessionProvider } from './src/session';
import { loadSunlight } from './src/lib/sunlight';
import { supabase } from './src/supabase';
import { useTheme } from './src/theme';

SplashScreen.preventAutoHideAsync();

/**
 * Så lenge splashen venter på valgene som bor på telefonen (sollys #2252,
 * tema #2256) før den slippes uansett.
 */
const DEVICE_CHOICES_TIMEOUT_MS = 1000;

export default function App() {
  const { colors, ui } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [deviceChoicesLoaded, setDeviceChoicesLoaded] = useState(false);
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

  // Ingen av de to kaster: en lesefeil gir sollys av og «Følg telefonen».
  // Svarer ikke lagrene innen et sekund, slippes splashen likevel (aldri heng
  // på splash); valgene kommer da på plass når lesingen blir ferdig.
  useEffect(() => {
    const timer = setTimeout(() => setDeviceChoicesLoaded(true), DEVICE_CHOICES_TIMEOUT_MS);
    void Promise.allSettled([loadSunlight(), applyStoredThemePreference()]).finally(() => {
      clearTimeout(timer);
      setDeviceChoicesLoaded(true);
    });
    return () => clearTimeout(timer);
  }, []);

  const ready = (fontsLoaded || fontsError != null) && !booting && deviceChoicesLoaded;

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
