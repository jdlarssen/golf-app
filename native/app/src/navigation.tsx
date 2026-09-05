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
import { Pressable, StyleSheet, Text } from 'react-native';
import Constants from 'expo-constants';
import { APP_NAME_FALLBACK } from './lib/loginCopy';
import { PROFILE_TEXT } from './lib/profileCopy';
import { Approve } from './screens/Approve';
import { CreateGame } from './screens/CreateGame';
import { DeleteAccount } from './screens/DeleteAccount';
import { EditProfile } from './screens/EditProfile';
import { EndGame } from './screens/EndGame';
import { GameHome } from './screens/GameHome';
import { Hole } from './screens/Hole';
import { Home } from './screens/Home';
import { Leaderboard } from './screens/Leaderboard';
import { Profile } from './screens/Profile';
import { Scorecard } from './screens/Scorecard';
import { useSession } from './session';
import { SyncLab } from './SyncLab';
import { FONTS, TAP, useTheme, type Theme } from './theme';

export type RootStackParamList = {
  Home: undefined;
  CreateGame: undefined;
  GameHome: { gameId: string };
  Hole: { gameId: string; holeNumber: number };
  Scorecard: { gameId: string };
  Leaderboard: { gameId: string };
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
  /** Bekreftelse på konto-sletting (#1876) — egen skjerm, husregelen. */
  DeleteAccount: undefined;
  SyncLab: undefined;
};

/** Props for én skjerm — `ScreenProps<'Hole'>` gir typede `route.params`. */
export type ScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Ordet «Profil» oppe til høyre på hjem.
 *
 * Et ord og ikke et ikon: ikonspråket (#1879) er ikke bygget ennå, og en løs
 * silhuett her ville forskuttert det valget. Tap-flaten er `TAP` bred og høy
 * selv om ordet er smalere — headeren er det trangeste stedet i appen å treffe,
 * og et ord på fem tegn er ikke en tap-flate i seg selv.
 */
function HeaderProfileLink({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.headerLink}
      testID="open-profile"
    >
      <Text style={[styles.headerLinkText, { color: colors.primary }]}>
        {PROFILE_TEXT.heading}
      </Text>
    </Pressable>
  );
}

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
          // `options` som funksjon får sin egen `navigation`, så inngangen til
          // profil-rommet kan bo her i stedet for i `Home.tsx`. Hjem slipper
          // dermed å kjenne til en skjerm den ellers ikke har noe med — og
          // headeren er uansett navigatorens flate, ikke skjermens.
          options={({ navigation }) => ({
            // Navnet leses fra den oppløste configen, ikke hardkodes (#1975):
            // butikk-varianten setter `name` til «Tørny», og en hardkodet
            // «Tørny Dev» ville fulgt med inn i App Store. Login-skjermen har
            // gjort det slik siden #1954 P1b — dette er den siste hardkodingen.
            title: Constants.expoConfig?.name ?? APP_NAME_FALLBACK,
            headerRight: () => (
              <HeaderProfileLink onPress={() => navigation.navigate('Profile')} />
            ),
          })}
        />
        <Stack.Screen
          name="CreateGame"
          component={CreateGame}
          options={{ title: 'Nytt spill' }}
        />
        <Stack.Screen
          name="GameHome"
          component={GameHome}
          options={{ title: 'Spill' }}
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
          options={{ title: PROFILE_TEXT.heading }}
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
          name="SyncLab"
          component={SyncLabScreen}
          options={{ title: 'Sync-lab' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerLink: {
    minWidth: TAP,
    minHeight: TAP,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerLinkText: { fontSize: 16, fontFamily: FONTS.sansMedium },
});
