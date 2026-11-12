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
//
// #2841: låsen med Face ID. Valget bor på telefonen som sollys og tema, og leses
// sammen med dem før splashen slippes. Er det på og en sesjon finnes ved
// kaldstart, står `AppLockGate` foran alt som henter data til telefonen har sagt
// ja. Den spør bare ved kaldstart; en ny innlogging i en kjørende app låses ikke.
//
// #2627, #2748: venne-lenka, QR-koden på bag-taggen og ligalenka åpner appen.
// Lyttingen starter her, før innloggingen, så en lenke som kommer mens Login
// vises, venter til navigatoren er montert og åpner skjermen (`data/pendingAppLink.ts`).
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
// Per-vekt-subpath, ikke pakke-rota: index-fila require-er ALLE snitt og
// kursiver (~15 MB TTF-er inn i bundelen). Kun de fire Inter-snittene vi
// bruker skal med. Fraunces har ett snitt per størrelse (`src/fonts.ts`,
// #2385).
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import type { Session } from '@supabase/supabase-js';
import { AiConsentGate } from './src/components/AiConsentGate';
import { AppLockGate } from './src/components/AppLockGate';
import { OwnerGate } from './src/components/OwnerGate';
import { ProfileGate } from './src/components/ProfileGate';
import { listenForAppLinks } from './src/data/pendingAppLink';
import { ensurePushChannel } from './src/data/pushDevice';
import { FRAUNCES_FILES } from './src/fonts';
import { RootNavigator } from './src/navigation';
import { KeyboardInset } from './src/components/KeyboardInset';
import { Login } from './src/screens/Login';
import { applyStoredThemePreference } from './src/lib/themePreference';
import { useUpdateGuard } from './src/lib/useUpdateGuard';
import { SessionProvider } from './src/session';
import { getAppLock, loadAppLock } from './src/lib/appLock';
import { loadSunlight } from './src/lib/sunlight';
import { supabase } from './src/supabase';
import { useTheme } from './src/theme';

SplashScreen.preventAutoHideAsync();

/**
 * Så lenge splashen venter på valgene som bor på telefonen (sollys #2252,
 * tema #2256, lås #2841) før den slippes uansett.
 */
const DEVICE_CHOICES_TIMEOUT_MS = 1000;

export default function App() {
  const { colors, ui } = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [deviceChoicesLoaded, setDeviceChoicesLoaded] = useState(false);
  const [fontsLoaded, fontsError] = useFonts({
    ...FRAUNCES_FILES,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // #2627, #2748: lenker fra første bilde, også før noen er logget inn.
  useEffect(() => listenForAppLinks(), []);
  // #2758: kanalen for varsler på Android finnes fra oppstart, også før innlogging.
  useEffect(() => {
    void ensurePushChannel();
  }, []);

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

  // Ingen av de tre kaster: en lesefeil gir sollys av, «Følg telefonen» og låsen av.
  // Svarer ikke lagrene innen et sekund, slippes splashen likevel (aldri heng
  // på splash); sollys og tema kommer da på plass når lesingen blir ferdig.
  // ASSUMPTION (#2841): låsen gjør ikke det. `startLocked` leses én gang når appen er
  // klar, så en lesing som tar over et sekund åpner appen ulåst denne ene starten.
  // Som en lesefeil (appLock.ts) er det så sjelden at å slippe inn er bedre enn å la
  // splashen henge eller å låse spilleren ute av en runde.
  useEffect(() => {
    const timer = setTimeout(() => setDeviceChoicesLoaded(true), DEVICE_CHOICES_TIMEOUT_MS);
    void Promise.allSettled([loadSunlight(), applyStoredThemePreference(), loadAppLock()]).finally(() => {
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

  // #2619: ber spilleren oppdatere når bygget er under minstenivået. Venter på
  // splashen, og gjelder også før innlogging.
  useUpdateGuard(ready);

  if (!ready) {
    // Bak splashen — synlig kun hvis hideAsync taper et kappløp med render.
    return (
      <View style={ui.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <ReadyApp session={session} />;
}

/**
 * Alt etter at splashen er klar. Egen komponent så `startLocked` leses én gang,
 * i det appen er klar: låsen gjelder en sesjon som finnes ved kaldstart, ikke en
 * innlogging i en kjørende app. Den nullstilles når telefonen har sagt ja, så en
 * ny innlogging etter utlogging ikke låses. Mister appen sesjonen FØR opplåsing
 * (utløpt token ved kaldstart), står `startLocked` igjen, og neste innlogging
 * spør om Face ID. Det er ufarlig, og det er ikke noen vei inn uten svar.
 */
function ReadyApp({ session }: { session: Session | null }) {
  const [startLocked, setStartLocked] = useState(() => session != null && getAppLock());
  const onUnlocked = useCallback(() => setStartLocked(false), []);

  // #2216: innfellingen har ett hjem for hele appen. Login og «Fullfør
  // profilen» står utenfor navigatoren og trenger den også; navigatoren bruker
  // denne i stedet for sin egen. `initialWindowMetrics` gjør at første bilde
  // tegnes med en gang, uten å vente på målingen.
  if (!session) {
    return (
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <KeyboardInset>
          <Login />
        </KeyboardInset>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {/* #1954 Del B: edge to edge, Android no longer shrinks the window for the keyboard. */}
      <KeyboardInset>
        <AppLockGate startLocked={startLocked} onUnlocked={onUnlocked}>
          <OwnerGate key={session.user.id} userId={session.user.id}>
            <SessionProvider
              value={{ userId: session.user.id, email: session.user.email ?? null }}
            >
              {/* «auto» følger systemets lys/mørk (#1833): mørk tekst på lys app, lys
                  tekst på mørk. «dark» var en midlertidig sannhet mens skjermene bare
                  fantes i lys drakt. */}
              <StatusBar style="auto" />
              {/* #2216: steget for navn og handicap står foran stacken når
                  profilen ikke er fullført, samme regel som nettsidens `/`. */}
              <ProfileGate userId={session.user.id}>
                {/* #2561: spørsmålet om AI-tekster, én gang, etter profilen. */}
                <AiConsentGate userId={session.user.id}>
                  <RootNavigator />
                </AiConsentGate>
              </ProfileGate>
            </SessionProvider>
          </OwnerGate>
        </AppLockGate>
      </KeyboardInset>
    </SafeAreaProvider>
  );
}
