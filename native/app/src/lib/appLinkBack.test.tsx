// native/app/src/lib/appLinkBack.test.tsx
// #2748: tilbake fra skjermene en lenke åpner, i en ekte navigator. Type C.
//
// Regel 1, 3 og 4 i `docs/user-flows.md` §Tilbake. Ekte `NavigationContainer`,
// native-stack og ruter, med stand-ins for skjermene, og lenka åpnes slik
// navigatoren gjør det (`appLinkScreen` og `StackActions.push`).
import {
  NavigationContainer,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, render } from '@testing-library/react-native';
import { View } from 'react-native';
import { appLinkScreen } from '../data/pendingAppLink';
import type { RootStackParamList } from '../navigation';
import { backTo, type BackNavigation } from './backTo';

const Stack = createNativeStackNavigator<RootStackParamList>();
const ref = createNavigationContainerRef<RootStackParamList>();
const Stub = () => <View />;

const SCREENS = ['Home', 'League', 'LeagueJoin'] as const;
const L1 = { leagueId: 'l1' };
const LINK = { kind: 'league', code: 'abcd2345' } as const;

const navigation: BackNavigation = {
  getState: () => ref.getRootState(),
  popTo: (name, params) => ref.dispatch(StackActions.popTo(name, params)),
  replace: (name, params) => ref.dispatch(StackActions.replace(name, params)),
  navigate: (name, params) => (ref.navigate as (n: string, p?: object) => void)(name, params),
  reset: (state) => ref.reset(state),
};

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

async function openLink() {
  const screen = appLinkScreen(LINK);
  await act(async () => {
    ref.dispatch(StackActions.push(screen.name, screen.params));
  });
}

async function joinTo(params: { leagueId: string; joined?: boolean }) {
  await act(async () => {
    backTo(navigation, 'League', params);
  });
}

async function back() {
  await act(async () => {
    ref.goBack();
  });
}

const names = () => ref.getRootState()?.routes.map((route) => route.name);

describe('lenka åpner «Bli med i liga» (#2748)', () => {
  it('tilbake uten å ha gjort noe går til Hjem', async () => {
    await stackOf();
    await openLink();
    expect(names()).toEqual(['Home', 'LeagueJoin']);
    await back();
    expect(names()).toEqual(['Home']);
  });

  it('[Hjem, Bli med] blir [Hjem, Ligaen] etter «Bli med», og tilbake går til Hjem', async () => {
    await stackOf();
    await openLink();
    await joinTo({ ...L1, joined: true });
    expect(names()).toEqual(['Home', 'League']);
    expect(ref.getCurrentRoute()?.params).toEqual({ ...L1, joined: true });
    await back();
    expect(names()).toEqual(['Home']);
  });

  it('er du alt med og ligaen ligger under, går du tilbake til den: ingen kopi', async () => {
    await stackOf(['League', L1]);
    await openLink();
    expect(names()).toEqual(['Home', 'League', 'LeagueJoin']);
    await joinTo(L1);
    expect(names()).toEqual(['Home', 'League']);
    await back();
    expect(names()).toEqual(['Home']);
  });

  it('en annen liga under blir liggende, og lenkas liga kommer oppå', async () => {
    await stackOf(['League', { leagueId: 'l2' }]);
    await openLink();
    await joinTo(L1);
    expect(names()).toEqual(['Home', 'League', 'League']);
    await back();
    expect(ref.getCurrentRoute()?.params).toEqual({ leagueId: 'l2' });
  });
});
