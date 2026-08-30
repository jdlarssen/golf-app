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
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { Approve } from './screens/Approve';
import { GameHome } from './screens/GameHome';
import { Hole } from './screens/Hole';
import { Home } from './screens/Home';
import { Leaderboard } from './screens/Leaderboard';
import { Scorecard } from './screens/Scorecard';
import { useSession } from './session';
import { SyncLab } from './SyncLab';

export type RootStackParamList = {
  Home: undefined;
  GameHome: { gameId: string };
  Hole: { gameId: string; holeNumber: number };
  Scorecard: { gameId: string };
  Leaderboard: { gameId: string };
  Approve: { gameId: string };
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

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#F8F6F0' },
          headerTintColor: '#1B4332',
          headerTitleStyle: { color: '#1B4332', fontWeight: '700' },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: '#F8F6F0' },
        }}
      >
        <Stack.Screen
          name="Home"
          component={Home}
          options={{ title: 'Tørny Dev' }}
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
          name="SyncLab"
          component={SyncLabScreen}
          options={{ title: 'Sync-lab' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
