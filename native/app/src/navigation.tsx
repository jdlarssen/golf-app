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
  createNavigationContainerRef,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef } from 'react';
import { settlePushOwner } from './data/pushDevice';
import { listenForPushTaps } from './data/pushTaps';
import type { PushTarget } from './lib/pushRoute';
import { HOLES_TEXT } from './lib/holesCopy';
import { APP_NAME_FALLBACK } from './lib/loginCopy';
import { FRIENDS_TEXT } from './lib/friendsCopy';
import { PROFILE_TEXT } from './lib/profileCopy';
import { SCORECARD_TEXT } from './lib/scorecardHeader';
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
import { kickerHeader } from './components/KickerHeader';
import { FONTS, useTheme, type Theme } from './theme';

export type RootStackParamList = {
  Home: undefined;
  CreateGame: undefined;
  GameHome: { gameId: string };
  Hole: { gameId: string; holeNumber: number };
  Scorecard: { gameId: string };
  Leaderboard: { gameId: string };
  /** «Hull for hull» (#2255) — flisa på spillets side når runden er avsluttet. */
  /**
   * `gameName` står i toppen som kicker, som på webben (#2255 PR 3b). Den
   * følger med fra spillets side, så toppen er riktig fra første bilde uten
   * at skjermen må sette den selv.
   */
  HoleByHole: { gameId: string; gameName?: string };
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

/**
 * Ref til navigatoren, så et trykk på et varsel kan åpne en skjerm utenfra
 * skjermtreet (#2256 PR 4).
 */
const navigationRef = createNavigationContainerRef<RootStackParamList>();

function openPushTarget(target: PushTarget) {
  if (target.name === 'GameHome') navigationRef.navigate('GameHome', target.params);
  else navigationRef.navigate('Home');
}

export function RootNavigator() {
  const theme = useTheme();
  const { colors } = theme;
  // Et trykk som startet appen kan komme før navigatoren er klar; da venter
  // skjermen her til `onReady`.
  const pendingPush = useRef<PushTarget | null>(null);
  useEffect(
    () =>
      listenForPushTaps((target) => {
        if (navigationRef.isReady()) openPushTarget(target);
        else pendingPush.current = target;
      }),
    [],
  );
  // Ny innlogging: varsler for en annen konto på telefonen ryddes (#2256 PR 4).
  useEffect(() => {
    void settlePushOwner();
  }, []);
  const onReady = useCallback(() => {
    const target = pendingPush.current;
    pendingPush.current = null;
    if (target) openPushTarget(target);
  }, []);
  return (
    <NavigationContainer ref={navigationRef} onReady={onReady} theme={navigationThemeFor(theme)}>
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
          // Designet (#2385): ingen «Hull N»-tittel. Hullsiden setter selv
          // spillnavnet i toppen og Sollys og pokalen til høyre.
          options={({ route }) => kickerHeader('', `Hull ${route.params.holeNumber}`)}
        />
        <Stack.Screen
          name="Scorecard"
          component={Scorecard}
          // Designet (#2385): «MITT SCOREKORT» i toppen, og spillnavnet stort
          // i innholdet. Lagformatene setter sitt eget ord fra skjermen.
          options={kickerHeader(SCORECARD_TEXT.kicker, SCORECARD_TEXT.screenTitle)}
        />
        <Stack.Screen
          name="Leaderboard"
          component={Leaderboard}
          options={{ title: 'Resultater' }}
        />
        <Stack.Screen
          name="HoleByHole"
          component={HoleByHole}
          options={({ route }) =>
            kickerHeader(route.params.gameName ?? HOLES_TEXT.heading, HOLES_TEXT.heading)
          }
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
          // Eierens svar (#2256, Profil v2): den felles topp-raden med bare
          // tilbake-pila, til bunnmenyen kommer. «Profil» og «Rediger» står
          // som raden under, i innholdet (`Profile.tsx`), som i designet.
          options={kickerHeader('', PROFILE_TEXT.heading)}
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
          options={kickerHeader(PROFILE_TEXT.heading, PROFILE_TEXT.notificationsHeading, {
            backLabel: PROFILE_TEXT.backToProfile,
          })}
        />
        <Stack.Screen
          name="Friends"
          component={Friends}
          options={kickerHeader(PROFILE_TEXT.heading, FRIENDS_TEXT.heading, {
            backLabel: PROFILE_TEXT.backToProfile,
          })}
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

