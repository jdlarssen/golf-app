// Native N3 (#1825): navigasjonen for spillerflatene.
//
// react-navigation native-stack, ikke expo-router: expo-router krever bytte av
// entry-point og filbasert app/-skanning oppå det uvanlige watchFolders-
// oppsettet appen deler `lib/` gjennom. Seks skjermer trenger ikke den magien.
// Deep links (N7) dekkes av react-navigations egen linking-config når den tid
// kommer.
//
// Param-lista er hele kontrakten mellom skjermene: en skjerm kan ikke åpnes
// uten id-ene den trenger, og `tsc` sier fra hvis noen navigerer feil.
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { Text } from 'react-native';
import Constants from 'expo-constants';
import { HOLES_TEXT } from './lib/holesCopy';
import { APP_NAME_FALLBACK } from './lib/loginCopy';
import { FRIENDS_TEXT } from './lib/friendsCopy';
import { PROFILE_TEXT } from './lib/profileCopy';
import { TICKET_TEXT } from './lib/ticketCopy';
import { AccountSettings } from './screens/AccountSettings';
import { Approve } from './screens/Approve';
import { CreateGame } from './screens/CreateGame';
import { DeleteAccount } from './screens/DeleteAccount';
import { EditProfile } from './screens/EditProfile';
import { EndGame } from './screens/EndGame';
import { Friends } from './screens/Friends';
import { GameHome } from './screens/GameHome';
import { Hole } from './screens/Hole';
import { HoleByHole } from './screens/HoleByHole';
import { Home } from './screens/Home';
import { Leaderboard } from './screens/Leaderboard';
import { NotificationsAndTheme } from './screens/NotificationsAndTheme';
import { Profile } from './screens/Profile';
import { Scorecard } from './screens/Scorecard';
import { useSession } from './session';
import { SyncLab } from './SyncLab';
import { FONTS, useTheme, type Theme } from './theme';

export type RootStackParamList = {
  Home: undefined;
  CreateGame: undefined;
  GameHome: { gameId: string };
  Hole: { gameId: string; holeNumber: number };
  Scorecard: { gameId: string };
  Leaderboard: { gameId: string };
  /** «Hull for hull» (#2255) — flisa på spillets side når runden er avsluttet. */
  HoleByHole: { gameId: string };
  Approve: { gameId: string };
  /** Arrangørens avslutt-flate (N6c, #1856) — kåring + status-flipp. */
  EndGame: { gameId: string };
  /**
   * Profil-rommet (#1906) — hvem du er, utlogging og veien til sletting.
   *
   * `saved` er kvitteringen `EditProfile` sender tilbake etter en lagring:
   * rommet viser banneret og henter raden på nytt. Rommet nullstiller den med
   * det samme (`setParams`), ellers ville banneret stått igjen neste gang
   * spilleren kom tilbake hit fra en annen skjerm.
   */
  Profile: { saved?: boolean } | undefined;
  /** Skjemaet bak «Rediger profil» (#1906) — de fem feltene, lagret via ruta. */
  /**
   * `returnTo` sier hvor Lagre skal legge deg av (#1979).
   *
   * Uten den navigerer skjermen alltid til `Profile`. Åpner du skjemaet fra
   * veiviserens siste steg — der «Rediger profil»-knappen står når din egen
   * profil stopper publiseringen — ville du havnet i profil-rommet med
   * veiviseren begravd i stacken. `'CreateGame'` gir `goBack()` i stedet, og
   * veiviseren står montert under med alt du har valgt.
   */
  EditProfile: { returnTo?: 'CreateGame' } | undefined;
  /**
   * Bekreftelse på konto-sletting (#1876) — egen skjerm, husregelen. Åpnes fra
   * «Personvern og konto» (#2256), og `goBack()` lander der.
   */
  DeleteAccount: undefined;
  /** «Personvern og konto» (#2256): e-post, personvernerklæring, «Slett konto». */
  AccountSettings: undefined;
  /** «Varsler og tema» (#2256): temavalget; varslene kommer i PR 4. */
  NotificationsAndTheme: undefined;
  /**
   * «Venner» (#2256): vennene dine, via `/api/friends`. `selfInitials` er
   * dine initialer til heltekortet, fra profilen som åpner skjermen.
   */
  Friends: { selfInitials?: string } | undefined;
  SyncLab: undefined;
};

/** Props for én skjerm — `ScreenProps<'Hole'>` gir typede `route.params`. */
export type ScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Sync-laben fra N2 beholdes som dev-verktøy. Den tar `userId` + `onBack` og
 * vet ingenting om navigasjon; wrapperen holder den slik — testene og
 * testID-ene fra N2 gjelder fortsatt uendret.
 */
function SyncLabScreen({ navigation }: ScreenProps<'SyncLab'>) {
  const { userId } = useSession();
  return <SyncLab userId={userId} onBack={() => navigation.goBack()} />;
}

/**
 * Vår palett → react-navigations container-tema.
 *
 * Containeren tegner flatene stacken IKKE eier — bakgrunnen bak en overgang og
 * under et gjennomsiktig header. Uten den ville en mørk app blinket lyst mellom
 * to skjermer. Bibliotekets egen default brukes som base slik at `fonts` og
 * andre felter vi ikke har en mening om blir stående.
 */
function navigationThemeFor(theme: Theme): NavigationTheme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.scheme === 'dark',
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.bg,
      card: theme.colors.bg,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.accent,
    },
  };
}

export function RootNavigator() {
  const theme = useTheme();
  const { colors } = theme;
  return (
    <NavigationContainer theme={navigationThemeFor(theme)}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          // Familienavn, ikke `fontWeight`: expo-font registrerer ett snitt per
          // familie, så en vekt oppå Inter Regular velger ikke Bold.
          headerTitleStyle: { color: colors.text, fontFamily: FONTS.sansBold },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen
          name="Home"
          component={Home}
          options={{
            // #2385: Hjem har ingen navigasjonslinje (designlerretet). Datoen
            // står øverst, og «Profil» er en lenke på datolinja i `Home.tsx`.
            headerShown: false,
            // Navnet leses fra den oppløste configen, ikke hardkodes (#1975):
            // butikk-varianten setter `name` til «Tørny», og en hardkodet
            // «Tørny Dev» ville fulgt med inn i App Store. Tittelen synes ikke
            // på Hjem, men iOS viser den i tilbake-menyen på skjermene over.
            title: Constants.expoConfig?.name ?? APP_NAME_FALLBACK,
          }}
        />
        <Stack.Screen
          name="CreateGame"
          component={CreateGame}
          options={{ title: 'Nytt spill' }}
        />
        <Stack.Screen
          name="GameHome"
          component={GameHome}
          // Startbilletten (#2255, designlerretet): «STARTBILLETT» i små
          // sperrede versaler og ingen skillelinje. Del-knappen til høyre
          // setter skjermen selv, for bare den vet om live-følging er på.
          options={kickerHeader(TICKET_TEXT.topTitle, TICKET_TEXT.topTitle)}
        />
        <Stack.Screen
          name="Hole"
          component={Hole}
          options={({ route }) => ({ title: `Hull ${route.params.holeNumber}` })}
        />
        <Stack.Screen
          name="Scorecard"
          component={Scorecard}
          options={{ title: 'Scorekort' }}
        />
        <Stack.Screen
          name="Leaderboard"
          component={Leaderboard}
          options={{ title: 'Resultater' }}
        />
        <Stack.Screen
          name="HoleByHole"
          component={HoleByHole}
          options={{ title: HOLES_TEXT.heading }}
        />
        <Stack.Screen
          name="Approve"
          component={Approve}
          options={{ title: 'Godkjenn' }}
        />
        <Stack.Screen
          name="EndGame"
          component={EndGame}
          options={{ title: 'Avslutt runden' }}
        />
        <Stack.Screen
          name="Profile"
          component={Profile}
          // Designet (#2256): «Profil» står stort i innholdet med «Rediger»
          // som pille ved siden av (`Profile.tsx`). Toppen har bare
          // tilbake-pila til hjem, og ingen skillelinje.
          // Tom streng, ikke en funksjon som gir `null`: da faller den native
          // headeren tilbake til `title` og viser «Profil» to ganger.
          options={{
            title: PROFILE_TEXT.heading,
            headerTitle: '',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="EditProfile"
          component={EditProfile}
          options={{ title: PROFILE_TEXT.editHeading }}
        />
        <Stack.Screen
          name="DeleteAccount"
          component={DeleteAccount}
          options={{ title: 'Slett konto' }}
        />
        <Stack.Screen
          name="AccountSettings"
          component={AccountSettings}
          options={{ title: PROFILE_TEXT.menuAccount }}
        />
        {/* Rommene under profilen (#2256, designet): «PROFIL» i toppen, og
            sidens navn stort i innholdet. */}
        <Stack.Screen
          name="NotificationsAndTheme"
          component={NotificationsAndTheme}
          options={kickerHeader(PROFILE_TEXT.heading, PROFILE_TEXT.menuNotificationsTheme)}
        />
        <Stack.Screen
          name="Friends"
          component={Friends}
          options={kickerHeader(PROFILE_TEXT.heading, FRIENDS_TEXT.heading)}
        />
        <Stack.Screen
          name="SyncLab"
          component={SyncLabScreen}
          options={{ title: 'Sync-lab' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/**
 * Toppen fra designlerretet (#2255, #2256): tilbake-pila, et lite sperret ord
 * i midten og ingen skillelinje. Ordet sier hvor du er («STARTBILLETT»,
 * «PROFIL»); sidens egen tittel står stort i innholdet (`PageTitle`). Én
 * stil for alle, i samme kicker-stil som feltetikettene i billetten.
 *
 * `title` er skjermens navn for systemet (app-bytteren, VoiceOver sin
 * «tilbake»), som kan være et annet enn ordet i toppen.
 */
function kickerHeader(kicker: string, title: string) {
  return {
    title,
    headerTitle: () => <KickerTitle label={kicker} />,
    headerShadowVisible: false,
  };
}

function KickerTitle({ label }: { label: string }) {
  const { ui } = useTheme();
  return (
    <Text accessibilityRole="header" style={ui.kicker}>
      {label}
    </Text>
  );
}
