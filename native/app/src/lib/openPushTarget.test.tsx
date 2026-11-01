// native/app/src/lib/openPushTarget.test.tsx
// #2746: trykk på varsel i en ekte navigator. Type C.
//
// Ekte `NavigationContainer`, native-stack og ruter, med stand-ins for
// skjermene. Ingen mocking av navigasjonen. Steg e i tapptesten er det samme
// løpet, men selve varselet kan bare prøves på en fysisk iPhone.
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, render } from '@testing-library/react-native';
import { View } from 'react-native';
import type { RootStackParamList } from '../navigation';
import { openPushTarget } from './openPushTarget';
import type { PushTarget } from './pushRoute';

const Stack = createNativeStackNavigator<RootStackParamList>();
const ref = createNavigationContainerRef<RootStackParamList>();
const Stub = () => <View />;

const SCREENS = [
  'Home',
  'GameHome',
  'Hole',
  'Scorecard',
  'Leaderboard',
  'League',
  'LeagueRoundStart',
  'MarkerApprove',
] as const;

const G = { gameId: 'g1' };

async function stackOf(...opened: [name: keyof RootStackParamList, params?: object][]) {
  await render(
    <NavigationContainer ref={ref}>
      <Stack.Navigator>
        {SCREENS.map((name) => (
          <Stack.Screen key={name} name={name} component={Stub} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>,
  );
  for (const [name, params] of opened) {
    await act(async () => {
      (ref.navigate as (name: string, params?: object) => void)(name, params);
    });
  }
}

async function tap(target: PushTarget) {
  await act(async () => {
    openPushTarget(ref, target);
  });
}

async function back() {
  await act(async () => {
    ref.goBack();
  });
}

const names = () => ref.getRootState()?.routes.map((route) => route.name);
const top = () => ref.getRootState()?.routes.at(-1)?.params;

describe('openPushTarget i en ekte navigator (#2746)', () => {
  it('hull fra Hjem: spillet under hullet', async () => {
    await stackOf();
    await tap({ name: 'Hole', params: { ...G, holeNumber: 5 } });
    expect(names()).toEqual(['Home', 'GameHome', 'Hole']);
    await back();
    expect(names()).toEqual(['Home', 'GameHome']);
  });

  it('hull mens du står på scorekortet i samme spill: ingen kopi av spillet', async () => {
    await stackOf(['GameHome', G], ['Hole', { ...G, holeNumber: 3 }], ['Scorecard', G]);
    await tap({ name: 'Hole', params: { ...G, holeNumber: 5 } });
    expect(names()).toEqual(['Home', 'GameHome', 'Hole']);
    expect(top()).toEqual({ ...G, holeNumber: 5 });
    await back();
    expect(names()).toEqual(['Home', 'GameHome']);
    await back();
    expect(names()).toEqual(['Home']);
  });

  it('hull mens du står på kortet uten noe hull under: spillet legges ikke oppå en gang til', async () => {
    await stackOf(['GameHome', G], ['Scorecard', G]);
    await tap({ name: 'Hole', params: { ...G, holeNumber: 5 } });
    expect(names()).toEqual(['Home', 'GameHome', 'Hole']);
  });

  it('et annet spill legges oppå, og det du sto i blir liggende', async () => {
    await stackOf(['GameHome', G], ['Hole', { ...G, holeNumber: 3 }]);
    await tap({ name: 'Leaderboard', params: { gameId: 'g2' } });
    expect(names()).toEqual(['Home', 'GameHome', 'Hole', 'GameHome', 'Leaderboard']);
    expect(top()).toEqual({ gameId: 'g2' });
  });

  it('spillet du alt har bak deg: tilbake dit', async () => {
    await stackOf(['GameHome', G], ['Scorecard', G]);
    await tap({ name: 'GameHome', params: G });
    expect(names()).toEqual(['Home', 'GameHome']);
  });

  it('tavla: spillet under, og tilbake lander på spillet', async () => {
    await stackOf();
    await tap({ name: 'Leaderboard', params: G });
    expect(names()).toEqual(['Home', 'GameHome', 'Leaderboard']);
  });

  it('ligaen under startsiden og markørens skjerm', async () => {
    await stackOf();
    await tap({ name: 'LeagueRoundStart', params: { leagueId: 'l1', roundId: 'r1' } });
    expect(names()).toEqual(['Home', 'League', 'LeagueRoundStart']);
    await tap({ name: 'MarkerApprove', params: { leagueId: 'l1', gameId: 'g1', userId: 'u1' } });
    expect(names()).toEqual(['Home', 'League', 'MarkerApprove']);
  });

  it('uten mål: til bunnen, ikke en ny Hjem oppå', async () => {
    await stackOf(['GameHome', G], ['Scorecard', G]);
    await tap({ name: 'Home' });
    expect(names()).toEqual(['Home']);
  });

  it('uten mål mens du står på Hjem: ingenting skjer', async () => {
    await stackOf();
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await tap({ name: 'Home' });
    expect(names()).toEqual(['Home']);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
