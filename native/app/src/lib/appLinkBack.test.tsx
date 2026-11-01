// native/app/src/lib/appLinkBack.test.tsx
// #2748: tilbake fra skjermene en lenke åpner, i en ekte navigator. Type C.
//
// Regel 1, 3 og 4 i `docs/user-flows.md` §Tilbake, med unntaket i regel 1. Ekte
// `NavigationContainer`, native-stack og ruter, med stand-ins for skjermene, og
// lenka åpnes med den samme funksjonen navigatoren bruker (`openAppLink`).
import {
  NavigationContainer,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, render } from '@testing-library/react-native';
import { View } from 'react-native';
import type { RootStackParamList } from '../navigation';
import type { AppLink } from './appLinkUrl';
import { backTo, type BackNavigation } from './backTo';
import { openAppLink } from './openAppLink';

const Stack = createNativeStackNavigator<RootStackParamList>();
const ref = createNavigationContainerRef<RootStackParamList>();
const Stub = () => <View />;

const SCREENS = [
  'Home',
  'GameHome',
  'Hole',
  'Leaderboard',
  'Profile',
  'League',
  'LeagueJoin',
  'InvitationLink',
] as const;
const L1 = { leagueId: 'l1' };
const G = { gameId: 'g1' };
const HOLE_5 = { ...G, holeNumber: 5 };
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

async function open(link: AppLink = LINK) {
  await act(async () => {
    openAppLink(ref, link);
  });
}

const openLink = () => open();
const INVITATION = { kind: 'invitation', token: 't1' } as const;

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
  it('lenka åpnet appen: tilbake uten å ha gjort noe går til Hjem', async () => {
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

  describe('andre skjermer står åpne når lenka kommer: tilbake går dit du sto', () => {
    it('hull 5: tilbake til hullet, ikke til Hjem', async () => {
      await stackOf(['GameHome', G], ['Hole', HOLE_5]);
      await openLink();
      expect(names()).toEqual(['Home', 'GameHome', 'Hole', 'LeagueJoin']);
      await back();
      expect(names()).toEqual(['Home', 'GameHome', 'Hole']);
      expect(ref.getCurrentRoute()?.params).toEqual(HOLE_5);
    });

    it('Profil: tilbake til Profil', async () => {
      await stackOf(['Profile']);
      await openLink();
      await back();
      expect(names()).toEqual(['Home', 'Profile']);
    });

    it('«Bli med» fra hull 5: ligaen tar skjemaets plass, og tilbake derfra går til hullet', async () => {
      await stackOf(['GameHome', G], ['Hole', HOLE_5]);
      await openLink();
      await joinTo({ ...L1, joined: true });
      expect(names()).toEqual(['Home', 'GameHome', 'Hole', 'League']);
      await back();
      expect(ref.getCurrentRoute()?.params).toEqual(HOLE_5);
    });
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

describe('lenka åpner invitasjonen (#2748)', () => {
  async function toGame() {
    await act(async () => {
      backTo(navigation, 'GameHome', G);
    });
  }

  it('lenka åpnet appen: spillet tar skjermens plass, og tilbake går til Hjem', async () => {
    await stackOf();
    await open(INVITATION);
    expect(names()).toEqual(['Home', 'InvitationLink']);
    await toGame();
    expect(names()).toEqual(['Home', 'GameHome']);
    await back();
    expect(names()).toEqual(['Home']);
  });

  it('tilbake uten at noe skjedde går til Hjem', async () => {
    await stackOf();
    await open(INVITATION);
    await back();
    expect(names()).toEqual(['Home']);
  });

  it('ligger spillet alt under, går du tilbake til det: ingen kopi', async () => {
    await stackOf(['GameHome', G]);
    await open(INVITATION);
    await toGame();
    expect(names()).toEqual(['Home', 'GameHome']);
  });

  it('står du på et annet spill, går tilbake dit', async () => {
    await stackOf(['GameHome', { gameId: 'g2' }]);
    await open(INVITATION);
    await toGame();
    expect(names()).toEqual(['Home', 'GameHome', 'GameHome']);
    await back();
    expect(ref.getCurrentRoute()?.params).toEqual({ gameId: 'g2' });
  });
});

// Rundelenka åpner det samme som varselet (`openPushTarget`, egne tester).
describe('e-posten om en runde (#2748)', () => {
  const round = (target: Extract<AppLink, { kind: 'round' }>['target']): AppLink => ({ kind: 'round', target });

  it('hullet: spillet under, og tilbake derfra går til Hjem', async () => {
    await stackOf();
    await open(round({ name: 'Hole', params: HOLE_5 }));
    expect(names()).toEqual(['Home', 'GameHome', 'Hole']);
    await back();
    await back();
    expect(names()).toEqual(['Home']);
  });

  it('tavla: spillet under', async () => {
    await stackOf();
    await open(round({ name: 'Leaderboard', params: G }));
    expect(names()).toEqual(['Home', 'GameHome', 'Leaderboard']);
  });

  it('ligger spillet alt under, går du tilbake til det: ingen kopi', async () => {
    await stackOf(['GameHome', G], ['Hole', HOLE_5]);
    await open(round({ name: 'GameHome', params: G }));
    expect(names()).toEqual(['Home', 'GameHome']);
  });
});
