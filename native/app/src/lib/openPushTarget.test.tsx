// native/app/src/lib/openPushTarget.test.tsx
// #2746: trykk på varsel i en ekte navigator. Type C.
//
// Ekte `NavigationContainer`, native-stack og ruter, med stand-ins for
// skjermene. Ingen mocking av navigasjonen. Steg e i tapptesten er det samme
// løpet, men selve varselet kan bare prøves på en fysisk iPhone.
import {
  CommonActions,
  NavigationContainer,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, render } from '@testing-library/react-native';
import { View } from 'react-native';
import type { RootStackParamList } from '../navigation';
import { openPushTarget, openScreenTarget } from './openPushTarget';
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
  'Approve',
  'EndGame',
  'Inbox',
  'Friends',
  'RoundStats',
  'League',
  'Cup',
  'CupParticipants',
  'LeagueRoundStart',
  'MarkerApprove',
  'RoundInvite',
  'TeamPage',
  'TeamRemoveConfirm',
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

  it('#2840: et lagvarsel åpner påmeldingsskjermen med koden, og bare én', async () => {
    await stackOf();
    await tap({ name: 'RoundInvite', params: { shortId: 'x2840aa6', src: null } });
    expect(names()).toEqual(['Home', 'RoundInvite']);
    expect(top()).toEqual({ shortId: 'x2840aa6', src: null });
    await tap({ name: 'RoundInvite', params: { shortId: 'x2840aa6', src: null } });
    expect(names()).toEqual(['Home', 'RoundInvite']);
  });

  it('#2840 del 3: et lagvarsel åpner lagsiden, og bare én', async () => {
    await stackOf();
    await tap({ name: 'TeamPage', params: { shortId: 'x2840aa6' } });
    expect(names()).toEqual(['Home', 'TeamPage']);
    expect(top()).toEqual({ shortId: 'x2840aa6' });
    await tap({ name: 'TeamPage', params: { shortId: 'x2840aa6' } });
    expect(names()).toEqual(['Home', 'TeamPage']);
    await back();
    expect(names()).toEqual(['Home']);
  });

  it('#2840 del 3: står du på bekreftelsen, går varselet tilbake til lagsiden under', async () => {
    await stackOf(['TeamPage', { shortId: 'x2840aa6' }], ['TeamRemoveConfirm', { shortId: 'x2840aa6', requestId: 'r1' }]);
    await tap({ name: 'TeamPage', params: { shortId: 'x2840aa6' } });
    expect(names()).toEqual(['Home', 'TeamPage']);
  });

  // Som for spillet: står lagsiden øverst, bytter `navigate` rundens kode på den i
  // stedet for å legge en ny oppå. Lagsiden leser koden og spør på nytt.
  it('#2840 del 3: et lagvarsel for en annen runde mens lagsiden står øverst, viser den andre runden', async () => {
    await stackOf(['TeamPage', { shortId: 'x2840aa6' }]);
    await tap({ name: 'TeamPage', params: { shortId: 'y2840bb7' } });
    expect(names()).toEqual(['Home', 'TeamPage']);
    expect(top()).toEqual({ shortId: 'y2840bb7' });
  });

  it('ligaen under startsiden og markørens skjerm', async () => {
    await stackOf();
    await tap({ name: 'LeagueRoundStart', params: { leagueId: 'l1', roundId: 'r1' } });
    expect(names()).toEqual(['Home', 'League', 'LeagueRoundStart']);
    await tap({ name: 'MarkerApprove', params: { leagueId: 'l1', gameId: 'g1', userId: 'u1' } });
    expect(names()).toEqual(['Home', 'League', 'MarkerApprove']);
  });

  it('spillerlista med cupen under, og uten en kopi av noen av dem (#2752)', async () => {
    await stackOf();
    await tap({ name: 'CupParticipants', params: { cupId: 'c1' } });
    expect(names()).toEqual(['Home', 'Cup', 'CupParticipants']);
    await tap({ name: 'CupParticipants', params: { cupId: 'c1' } });
    expect(names()).toEqual(['Home', 'Cup', 'CupParticipants']);
    await back();
    expect(names()).toEqual(['Home', 'Cup']);
  });

  it('cupen fra Hjem, og tilbake til den cupen du alt har bak deg (#2752)', async () => {
    await stackOf();
    await tap({ name: 'Cup', params: { cupId: 'c1' } });
    expect(names()).toEqual(['Home', 'Cup']);
    await back();
    expect(names()).toEqual(['Home']);

    await stackOf(['Cup', { cupId: 'c1' }], ['GameHome', G]);
    await tap({ name: 'Cup', params: { cupId: 'c1' } });
    expect(names()).toEqual(['Home', 'Cup']);
    expect(top()).toEqual({ cupId: 'c1' });
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

describe('et trykk i innboksen (#2759)', () => {
  /** Skjermenes `navigation`, slik `Inbox` får den. */
  async function tapInInbox(target: Parameters<typeof openScreenTarget>[1]) {
    await act(async () => {
      openScreenTarget(
        {
          getState: () => ref.getRootState(),
          popTo: (name, params) => ref.dispatch(StackActions.popTo(name, params)),
          replace: (name, params) => ref.dispatch(StackActions.replace(name, params)),
          navigate: (name, params) => ref.dispatch(CommonActions.navigate(name, params)),
          reset: (state) => ref.dispatch(CommonActions.reset(state)),
        },
        target,
      );
    });
  }

  it.each([
    ['Approve', { name: 'Approve', params: G }],
    ['Scorecard', { name: 'Scorecard', params: G }],
    ['EndGame', { name: 'EndGame', params: G }],
    ['Hole', { name: 'Hole', params: { ...G, holeNumber: 7 } }],
    ['Leaderboard', { name: 'Leaderboard', params: G }],
  ] as const)('%s har spillet under, og tilbake lander i innboksen', async (name, target) => {
    await stackOf(['Inbox']);
    await tapInInbox(target);
    expect(names()).toEqual(['Home', 'Inbox', 'GameHome', name]);
    await back();
    expect(names()).toEqual(['Home', 'Inbox', 'GameHome']);
    await back();
    expect(names()).toEqual(['Home', 'Inbox']);
  });

  it.each([
    ['GameHome', { name: 'GameHome', params: G }],
    ['Friends', { name: 'Friends', params: { from: 'notification' } }],
    ['RoundStats', { name: 'RoundStats' }],
    ['League', { name: 'League', params: { leagueId: 'l1' } }],
    ['Cup', { name: 'Cup', params: { cupId: 'c1' } }],
  ] as const)('%s ligger rett over innboksen, og tilbake lander der', async (name, target) => {
    await stackOf(['Inbox']);
    await tapInInbox(target);
    expect(names()).toEqual(['Home', 'Inbox', name]);
    await back();
    expect(names()).toEqual(['Home', 'Inbox']);
  });

  it('kortet levert fra et trykk i innboksen: spillet står, og tilbake når innboksen', async () => {
    await stackOf(['Inbox']);
    await tapInInbox({ name: 'Scorecard', params: G });
    await tapInInbox({ name: 'GameHome', params: G });
    expect(names()).toEqual(['Home', 'Inbox', 'GameHome']);
    await back();
    expect(names()).toEqual(['Home', 'Inbox']);
  });

  it('et push-trykk på «scorekort venter» åpner godkjenningen med spillet under', async () => {
    await stackOf();
    await tap({ name: 'Approve', params: G });
    expect(names()).toEqual(['Home', 'GameHome', 'Approve']);
  });
});
