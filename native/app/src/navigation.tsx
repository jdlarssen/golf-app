// Native N3 (#1825): navigasjonen for spillerflatene.
//
// react-navigation native-stack, ikke expo-router: expo-router krever bytte av
// entry-point og filbasert app/-skanning oppå det uvanlige watchFolders-
// oppsettet appen deler `lib/` gjennom. Seks skjermer trenger ikke den magien.
// Dype lenker går ikke gjennom react-navigations linking-config. Den eneste
// lenka som åpner en skjerm, er venne-lenka (#2627): `App.tsx` lytter,
// `data/pendingFriendLink.ts` holder koden, og navigatoren åpner
// «Bli venn med …» (`openPendingFriendLink`). Varsler åpner skjermer via
// `listenForPushTaps`.
//
// Param-lista er hele kontrakten mellom skjermene: en skjerm kan ikke åpnes
// uten id-ene den trenger, og `tsc` sier fra hvis noen navigerer feil.
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  StackActions,
  createNavigationContainerRef,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { ErrorBoundary } from './components/ErrorBoundary';
import { errorBoundaryVariantFor } from './lib/errorBoundaryCopy';
import { settlePushOwner } from './data/pushDevice';
import {
  friendLinkStep,
  pendingFriendCode,
  subscribePendingFriendCode,
  takePendingFriendCode,
} from './data/pendingFriendLink';
import { listenForPushTaps } from './data/pushTaps';
import type { PushTarget } from './lib/pushRoute';
import { END_GAME_TEXT } from './lib/endGameCopy';
import { HOLES_TEXT } from './lib/holesCopy';
import { LEAGUE_TEXT } from './lib/leagueCopy';
import { APP_NAME_FALLBACK } from './lib/loginCopy';
import { FRIEND_LINK_TEXT, FRIENDS_TEXT, friendsTopBar } from './lib/friendsCopy';
import { HISTORY_TEXT } from './lib/historyCopy';
import { KAVALKADE_TEXT } from './lib/kavalkadeCopy';
import { PROFILE_TEXT, notificationsThemeHeading } from './lib/profileCopy';
import { SCORECARD_TEXT } from './lib/scorecardHeader';
import { TICKET_TEXT } from './lib/ticketCopy';
import { AccountSettings } from './screens/AccountSettings';
import { Approve } from './screens/Approve';
import { CreateGame } from './screens/CreateGame';
import { DeleteAccount } from './screens/DeleteAccount';
import { EditProfile } from './screens/EditProfile';
import { EndGame } from './screens/EndGame';
import { FriendLink } from './screens/FriendLink';
import { Friends } from './screens/Friends';
import { GameHome } from './screens/GameHome';
import { Hole } from './screens/Hole';
import { HoleByHole } from './screens/HoleByHole';
import { Home } from './screens/Home';
import { Leaderboard } from './screens/Leaderboard';
import { League } from './screens/League';
import { MarkerApprove } from './screens/MarkerApprove';
import { LeagueRoundStart } from './screens/LeagueRoundStart';
import { NotificationsAndTheme } from './screens/NotificationsAndTheme';
import { Profile } from './screens/Profile';
import { RoundDiary } from './screens/RoundDiary';
import { RoundStats } from './screens/RoundStats';
import { Kavalkade } from './screens/Kavalkade';
import { Scorecard } from './screens/Scorecard';
import { useSession } from './session';
import { SyncLab } from './SyncLab';
import { kickerHeader } from './components/KickerHeader';
import { FONTS, useTheme, type Theme } from './theme';
import { MARKER_TEXT } from './lib/markerCopy';

export type RootStackParamList = {
  Home: undefined;
  CreateGame: undefined;
  GameHome: { gameId: string };
  /**
   * `gameName` og `topLine` (#2228): toppen hullsiden setter selv når bundelen
   * er lest. De sendes også med når siden åpnes, så toppen står også når
   * skjermens feilgrense har avmontert siden. Uten dem (fra et varsel) står
   * midten tom.
   */
  Hole: { gameId: string; holeNumber: number; gameName?: string; topLine?: string };
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
   * veiviserens siste steg (knappen står under merknaden om at din egen
   * profil mangler navn eller handicap, #2441), ville du havnet i profil-rommet med
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
   * `from: 'friendLink'` (#2627): åpnet fra «Bli venn med …», så toppen har
   * bare pila («Tilbake»), uten «PROFIL» (`friendsTopBar`).
   */
  Friends: { selfInitials?: string; from?: 'friendLink' } | undefined;
  /**
   * «Bli venn med …» (#2627): venne-lenka eller QR-koden på bag-taggen åpnet
   * appen. `code` er venne-koden fra lenka (`lib/friendLinkUrl.ts`).
   */
  FriendLink: { code: string };
  /**
   * Rundedagboka (#2265). `from: 'home'` når «Alle runder →» på Hjem åpnet
   * den: da heter pila bare «Tilbake», ellers «Tilbake til profil».
   */
  RoundDiary: { from?: 'home' } | undefined;
  /** Statistikken bak Rundedagboka («Se all statistikk», #2265). */
  RoundStats: undefined;
  /** Kavalkaden (#2265 PR 2): golfåret ditt som kortstokk, fra webben. */
  Kavalkade: undefined;
  /**
   * Ligasiden (#2638 Del 2): tabellen, rundene og innstillingene, fra
   * `GET /api/liga/[id]`. Åpnes fra «Ligaene dine» på Hjem.
   */
  League: { leagueId: string };
  /**
   * «Start runden» i en ligarunde (#2638 Del 2). Etter start erstattes den av
   * spillet (`replace('GameHome')`), så «tilbake» fra spillet går til ligaen.
   */
  LeagueRoundStart: { leagueId: string; roundId: string };
  /**
   * #2661: markørens skjerm for ett kort i en simulatorliga, fra
   * `GET /api/liga/[id]/godkjenn/[gameId]/[userId]`. Åpnes fra ligasiden og
   * fra varselet `league_marker_request`.
   */
  MarkerApprove: { leagueId: string; gameId: string; userId: string };
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
  else if (target.name === 'Hole') {
    // #2268: the game's page under the hole, so «back» lands on the game.
    navigationRef.navigate('GameHome', { gameId: target.params.gameId });
    navigationRef.navigate('Hole', target.params);
  } else if (target.name === 'Leaderboard') {
    // #2632: spillets side under tavla, så «tilbake» lander på spillet.
    navigationRef.navigate('GameHome', { gameId: target.params.gameId });
    navigationRef.navigate('Leaderboard', target.params);
  } else if (target.name === 'League') navigationRef.navigate('League', target.params);
  else if (target.name === 'LeagueRoundStart') {
    // #2675: ligasiden under startsiden, så «tilbake» lander på ligaen.
    navigationRef.navigate('League', { leagueId: target.params.leagueId });
    navigationRef.navigate('LeagueRoundStart', target.params);
  } else if (target.name === 'MarkerApprove') {
    // #2661: ligasiden under markørens skjerm, så «tilbake» lander på ligaen.
    navigationRef.navigate('League', { leagueId: target.params.leagueId });
    navigationRef.navigate('MarkerApprove', target.params);
  } else navigationRef.navigate('Home');
}

/**
 * «Bli venn med …» for venne-koden som venter (#2627). Avgjørelsen er
 * `friendLinkStep`: vent til navigatoren er klar, og åpne ikke skjermen en gang
 * til når den alt står øverst med samme kode.
 */
function openPendingFriendLink() {
  const ready = navigationRef.isReady();
  const step = friendLinkStep(ready, ready ? navigationRef.getCurrentRoute() : undefined, pendingFriendCode());
  if (step === 'wait') return;
  const code = takePendingFriendCode();
  if (step === 'push' && code) navigationRef.dispatch(StackActions.push('FriendLink', { code }));
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
  // #2627: en venne-lenke som kommer mens appen er åpen. En som kom før
  // innloggingen (eller før navigatoren var klar), tas i `onReady`.
  useEffect(() => subscribePendingFriendCode(openPendingFriendLink), []);
  const onReady = useCallback(() => {
    const target = pendingPush.current;
    pendingPush.current = null;
    if (target) openPushTarget(target);
    openPendingFriendLink();
  }, []);
  // #2228: hver skjerm har sin egen feilgrense (`screenLayout`), så headerens
  // tilbakeknapp virker når en skjerm kaster. Varianten følger skjermen. Den
  // ytre fanger det som kaster utenfor skjermene, og har ingen tilbakeknapp.
  const navigator = (
    <NavigationContainer ref={navigationRef} onReady={onReady} theme={navigationThemeFor(theme)}>
      <Stack.Navigator
        screenLayout={({ children, route }) => (
          <ErrorBoundary variant={errorBoundaryVariantFor(route.name)}>{children}</ErrorBoundary>
        )}
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
          // spillnavnet i toppen og Sollys og pokalen til høyre. Fra
          // parametrene står spillnavnet og «format · bane» også når siden
          // har kastet (#2228); pokalen er bevisst ikke med der.
          options={({ route }) =>
            kickerHeader(route.params.gameName ?? '', `Hull ${route.params.holeNumber}`, {
              subtitle: route.params.topLine || undefined,
              tone: 'gold',
            })
          }
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
          options={kickerHeader('', 'Godkjenn')}
        />
        <Stack.Screen
          name="EndGame"
          component={EndGame}
          options={kickerHeader('', END_GAME_TEXT.heading, { backLabel: END_GAME_TEXT.backToGame })}
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
          options={kickerHeader(PROFILE_TEXT.heading, notificationsThemeHeading(Platform.OS), {
            backLabel: PROFILE_TEXT.backToProfile,
          })}
        />
        <Stack.Screen
          name="Friends"
          component={Friends}
          options={({ route }) => {
            // #2627: fra «Bli venn med …» nevner ikke toppen Profil.
            const top = friendsTopBar(route.params?.from);
            return kickerHeader(top.kicker, FRIENDS_TEXT.heading, { backLabel: top.backLabel });
          }}
        />
        {/* «Bli venn med …» (#2627): «LEGG TIL VENN» i toppen, som nettsiden,
            og eierens navn stort i innholdet. */}
        <Stack.Screen
          name="FriendLink"
          component={FriendLink}
          options={kickerHeader(FRIEND_LINK_TEXT.kicker, FRIEND_LINK_TEXT.kicker)}
        />
        {/* Rundedagboka (#2265, designlerretet): «HISTORIKK» i toppen og
            «Rundedagboka» stort i innholdet. Pila sier hvor den fører. */}
        <Stack.Screen
          name="RoundDiary"
          component={RoundDiary}
          options={({ route }) =>
            kickerHeader(HISTORY_TEXT.kicker, HISTORY_TEXT.kicker, {
              backLabel: route.params?.from === 'home' ? undefined : PROFILE_TEXT.backToProfile,
            })
          }
        />
        <Stack.Screen
          name="RoundStats"
          component={RoundStats}
          options={kickerHeader(HISTORY_TEXT.kicker, HISTORY_TEXT.statsTitle)}
        />
        {/* Kavalkaden (#2265 PR 2): «KAVALKADEN» i toppen, som webbens side. */}
        <Stack.Screen
          name="Kavalkade"
          component={Kavalkade}
          options={kickerHeader(KAVALKADE_TEXT.kicker, KAVALKADE_TEXT.kicker)}
        />
        {/* Ligaen (#2638 Del 2, tegningene 2–6): «LIGA» og «START RUNDE» i
            toppen, som nettsiden. */}
        <Stack.Screen
          name="League"
          component={League}
          options={kickerHeader(LEAGUE_TEXT.kicker, LEAGUE_TEXT.kicker)}
        />
        {/* #2661: markørens kort. Skjermen setter liganavnet i toppen selv. */}
        <Stack.Screen
          name="MarkerApprove"
          component={MarkerApprove}
          options={kickerHeader(LEAGUE_TEXT.kicker, MARKER_TEXT.screenTitle)}
        />
        <Stack.Screen
          name="LeagueRoundStart"
          component={LeagueRoundStart}
          options={kickerHeader(LEAGUE_TEXT.startKicker, LEAGUE_TEXT.startKicker)}
        />
        <Stack.Screen
          name="SyncLab"
          component={SyncLabScreen}
          options={{ title: 'Sync-lab' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
  return <ErrorBoundary variant="noBack">{navigator}</ErrorBoundary>;
}

