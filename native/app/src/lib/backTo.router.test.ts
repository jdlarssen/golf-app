// native/app/src/lib/backTo.router.test.ts
// #2746: tilbake-veiene mot react-navigations ekte `StackRouter`. Type A.
//
// `backTo.test.ts` viser hvilket kall hjelperne gjør. Denne fila viser hva
// stakken blir når ruteren selv utfører kallene, og hvor tilbake da fører.
// Stegene er de samme som tapptesten i appen (kontrakten, AK7 a–e).
import { CommonActions, StackActions, StackRouter, type StackNavigationState } from '@react-navigation/routers';
import type { RootStackParamList } from '../navigation';
import { backTo, openOrReturn, type BackNavigation } from './backTo';

type State = StackNavigationState<RootStackParamList>;
type Action = Parameters<ReturnType<typeof StackRouter>['getStateForAction']>[1];
type RouteWithKey = { name: string; key?: string };

const CONFIG = {
  routeNames: [
    'Home',
    'GameHome',
    'Hole',
    'Scorecard',
    'Leaderboard',
    'Approve',
    'Profile',
    'EditProfile',
    'League',
    'LeagueRoundStart',
    'MarkerApprove',
  ],
  routeParamList: {},
  routeGetIdList: {},
};

/** En stakk som starter på Hjem, med `screens` åpnet oppå i rekkefølge. */
function realStack(...screens: [name: string, params?: object][]) {
  const router = StackRouter({});
  let state = router.getInitialState(CONFIG) as unknown as State;
  const apply = (action: Action) => {
    const next = router.getStateForAction(state as never, action, CONFIG);
    if (next === null) throw new Error(`ruteren tok ikke ${action.type}`);
    state = next as unknown as State;
  };
  for (const [name, params] of screens) apply(StackActions.push(name, params));

  const navigation: BackNavigation & { back(): void; stack(): string[] } = {
    getState: () => state,
    popTo: (name, params) => apply(StackActions.popTo(name, params)),
    replace: (name, params) => apply(StackActions.replace(name, params)),
    navigate: (name, params) => apply(CommonActions.navigate(name, params)),
    reset: (next) => apply(CommonActions.reset(next)),
    back: () => apply(CommonActions.goBack()),
    /** Stakken som tekst: navnet, og hullet der det er et hull. */
    stack: () =>
      state.routes.map((route) => {
        const hole = (route.params as { holeNumber?: number } | undefined)?.holeNumber;
        return hole ? `${route.name} ${hole}` : route.name;
      }),
  };
  return navigation;
}

const G = { gameId: 'g1' };

describe('tilbake-veiene i appen mot den ekte ruteren', () => {
  it('kontroll: `navigate` etter levering legger spillet oppå kortet (feilen i #2746)', () => {
    const nav = realStack(['GameHome', G], ['Hole', { ...G, holeNumber: 18 }], ['Scorecard', G]);
    nav.navigate('GameHome' as never, G as never);
    expect(nav.stack()).toEqual(['Home', 'GameHome', 'Hole 18', 'Scorecard', 'GameHome']);
  });

  it('a: lever kort → spillet → tilbake → Hjem', () => {
    const nav = realStack(['GameHome', G], ['Hole', { ...G, holeNumber: 18 }], ['Scorecard', G]);
    backTo(nav, 'GameHome', G);
    expect(nav.stack()).toEqual(['Home', 'GameHome']);
    nav.back();
    expect(nav.stack()).toEqual(['Home']);
  });

  it('a: kortet åpnet fra Hjem → lever → spillet → tilbake → Hjem', () => {
    const nav = realStack(['Scorecard', G]);
    backTo(nav, 'GameHome', G);
    expect(nav.stack()).toEqual(['Home', 'GameHome']);
    nav.back();
    expect(nav.stack()).toEqual(['Home']);
  });

  // Evaluatorens funn (runde 1): Hjem-kortet åpner hullet rett fra Hjem, uten
  // spillet under. Det er hovedveien under en runde.
  it('a: Hjem-kortets hull 18 → scorekort → lever → spillet → tilbake → Hjem', () => {
    const nav = realStack(['Hole', { ...G, holeNumber: 18 }], ['Scorecard', G]);
    backTo(nav, 'GameHome', G);
    expect(nav.stack()).toEqual(['Home', 'GameHome']);
    nav.back();
    expect(nav.stack()).toEqual(['Home']);
  });

  it('Hjem-kortets hull: skjermene som blir liggende, beholder nøklene sine', () => {
    const nav = realStack(['Hole', { ...G, holeNumber: 18 }], ['Scorecard', G]);
    const homeKey = (nav.getState()!.routes[0] as RouteWithKey).key;
    backTo(nav, 'GameHome', G);
    expect((nav.getState()!.routes[0] as RouteWithKey).key).toBe(homeKey);
  });

  it('b: Profil → rediger → lagre → tilbake → Hjem', () => {
    const nav = realStack(['Profile'], ['EditProfile']);
    backTo(nav, 'Profile', { saved: true });
    expect(nav.stack()).toEqual(['Home', 'Profile']);
    expect(nav.getState()!.routes[1]!.params).toEqual({ saved: true });
    nav.back();
    expect(nav.stack()).toEqual(['Home']);
  });

  it('c: hull → tavla → stripa → hull → tilbake → spillet', () => {
    const nav = realStack(['GameHome', G], ['Hole', { ...G, holeNumber: 3 }]);
    openOrReturn(nav, 'Leaderboard', G);
    expect(nav.stack()).toEqual(['Home', 'GameHome', 'Hole 3', 'Leaderboard']);
    openOrReturn(nav, 'Hole', { ...G, holeNumber: 4 });
    expect(nav.stack()).toEqual(['Home', 'GameHome', 'Hole 4']);
    nav.back();
    expect(nav.stack()).toEqual(['Home', 'GameHome']);
  });

  it('c: hull → scorekort → hull 7 gir ett hull, ikke tre skjermer', () => {
    const nav = realStack(['GameHome', G], ['Hole', { ...G, holeNumber: 3 }]);
    openOrReturn(nav, 'Scorecard', G);
    openOrReturn(nav, 'Hole', { ...G, holeNumber: 7 });
    expect(nav.stack()).toEqual(['Home', 'GameHome', 'Hole 7']);
  });

  it('e: varsel om et hull mens du står i spillet → tilbake → spillet', () => {
    const nav = realStack(['GameHome', G], ['Hole', { ...G, holeNumber: 3 }], ['Scorecard', G]);
    // Samme to steg som `openPushTarget` i `navigation.tsx`.
    openOrReturn(nav, 'GameHome', G);
    openOrReturn(nav, 'Hole', { ...G, holeNumber: 5 });
    expect(nav.stack()).toEqual(['Home', 'GameHome', 'Hole 5']);
    nav.back();
    expect(nav.stack()).toEqual(['Home', 'GameHome']);
  });

  it('e: varsel om et hull fra Hjem → spillet under hullet', () => {
    const nav = realStack();
    openOrReturn(nav, 'GameHome', G);
    openOrReturn(nav, 'Hole', { ...G, holeNumber: 5 });
    expect(nav.stack()).toEqual(['Home', 'GameHome', 'Hole 5']);
  });

  it('varsel om et annet spill legger det nye spillet oppå, ikke tilbake til det gamle', () => {
    const nav = realStack(['GameHome', G], ['Hole', { ...G, holeNumber: 3 }]);
    openOrReturn(nav, 'GameHome', { gameId: 'g2' });
    expect(nav.stack()).toEqual(['Home', 'GameHome', 'Hole 3', 'GameHome']);
    expect(nav.getState()!.routes[3]!.params).toEqual({ gameId: 'g2' });
  });

  it('trukket fra runden → Hjem, uten spillet under', () => {
    const nav = realStack(['GameHome', G]);
    backTo(nav, 'Home');
    expect(nav.stack()).toEqual(['Home']);
  });

  it('godkjent → «Se tavla» → tilbake → spillet', () => {
    const nav = realStack(['GameHome', G], ['Approve', G]);
    backTo(nav, 'Leaderboard', G);
    expect(nav.stack()).toEqual(['Home', 'GameHome', 'Leaderboard']);
    nav.back();
    expect(nav.stack()).toEqual(['Home', 'GameHome']);
  });
});
