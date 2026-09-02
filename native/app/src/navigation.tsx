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
import { Approve } from './screens/Approve';
import { CreateGame } from './screens/CreateGame';
import { EndGame } from './screens/EndGame';
import { GameHome } from './screens/GameHome';
import { Hole } from './screens/Hole';
import { Home } from './screens/Home';
import { Leaderboard } from './screens/Leaderboard';
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
  Approve: { gameId: string };
  /** Arrangørens avslutt-flate (N6c, #1856) — kåring + status-flipp. */
  EndGame: { gameId: string };
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
          options={{ title: 'Tørny Dev' }}
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
          name="SyncLab"
          component={SyncLabScreen}
          options={{ title: 'Sync-lab' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
