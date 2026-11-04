// #2759: tilbake fra en skjerm åpnet fra innboksen, mot react-navigations ekte
// `StackRouter`. Type A, samme rigg som `backTo.router.test.ts`.
import { CommonActions, StackActions, StackRouter, type StackNavigationState } from '@react-navigation/routers';
import type { RootStackParamList } from '../navigation';
import { backTo, type BackNavigation } from './backTo';
import { openScreenTarget } from './openPushTarget';
import type { ScreenTarget } from './pushRoute';

type State = StackNavigationState<RootStackParamList>;
type Action = Parameters<ReturnType<typeof StackRouter>['getStateForAction']>[1];

const CONFIG = {
  routeNames: [
    'Home',
    'Inbox',
    'GameHome',
    'Hole',
    'Scorecard',
    'Leaderboard',
    'Approve',
    'EndGame',
    'Friends',
    'RoundStats',
    'League',
    'LeagueRoundStart',
    'MarkerApprove',
    'Cup',
    'CupParticipants',
  ],
  routeParamList: {},
  routeGetIdList: {},
};

/** Stakken fra Hjem med innboksen åpen, slik konvolutten gir den. */
function fromInbox() {
  const router = StackRouter({});
  let state = router.getInitialState(CONFIG) as unknown as State;
  const apply = (action: Action) => {
    const next = router.getStateForAction(state as never, action, CONFIG);
    if (next === null) throw new Error(`ruteren tok ikke ${action.type}`);
    state = next as unknown as State;
  };
  apply(StackActions.push('Inbox'));
  const navigation: BackNavigation & { back(): void; stack(): string[] } = {
    getState: () => state,
    popTo: (name, params) => apply(StackActions.popTo(name, params)),
    replace: (name, params) => apply(StackActions.replace(name, params)),
    navigate: (name, params) => apply(CommonActions.navigate(name, params)),
    reset: (next) => apply(CommonActions.reset(next)),
    back: () => apply(CommonActions.goBack()),
    stack: () => state.routes.map((route) => route.name),
  };
  return navigation;
}

const G = { gameId: 'g1' };

describe('tilbake fra innboksen mot den ekte ruteren', () => {
  it.each<[string, ScreenTarget, string[]]>([
    ['spillet', { name: 'GameHome', params: G }, []],
    ['vennene', { name: 'Friends', params: { from: 'notification' } }, []],
    ['statistikken', { name: 'RoundStats' }, []],
    ['ligaen', { name: 'League', params: { leagueId: 'l1' } }, []],
    ['cupen', { name: 'Cup', params: { cupId: 'c1' } }, []],
    ['godkjenningen', { name: 'Approve', params: G }, ['GameHome']],
    ['scorekortet', { name: 'Scorecard', params: G }, ['GameHome']],
    ['avslutningen', { name: 'EndGame', params: G }, ['GameHome']],
    ['hullet', { name: 'Hole', params: { ...G, holeNumber: 5 } }, ['GameHome']],
    ['tavla', { name: 'Leaderboard', params: G }, ['GameHome']],
    ['spillerlista', { name: 'CupParticipants', params: { cupId: 'c1' } }, ['Cup']],
    ['startsiden', { name: 'LeagueRoundStart', params: { leagueId: 'l1', roundId: 'r1' } }, ['League']],
    ['markøren', { name: 'MarkerApprove', params: { leagueId: 'l1', gameId: 'g1', userId: 'u1' } }, ['League']],
  ])('%s: tilbake ender i innboksen', (_name, target, under) => {
    const nav = fromInbox();
    openScreenTarget(nav, target);
    expect(nav.stack()).toEqual(['Home', 'Inbox', ...under, target.name]);
    for (let i = 0; i <= under.length; i++) nav.back();
    expect(nav.stack()).toEqual(['Home', 'Inbox']);
  });

  it('et levert kort fra innboksen lander på spillet, og tilbake går til innboksen', () => {
    const nav = fromInbox();
    openScreenTarget(nav, { name: 'Scorecard', params: G });
    backTo(nav, 'GameHome', G);
    expect(nav.stack()).toEqual(['Home', 'Inbox', 'GameHome']);
    nav.back();
    expect(nav.stack()).toEqual(['Home', 'Inbox']);
  });
});
