// native/app/src/lib/openPushTarget.ts
// #2746: et trykk på et varsel åpner skjermen `pushTarget` peker på (#2256 PR 4).
//
// Varslene følger samme regel som skjermene (`docs/user-flows.md` §Tilbake):
// ligger spillet eller ligaen alt i stakken, går trykket tilbake dit i stedet
// for å legge en kopi oppå. Står her og ikke i `navigation.tsx`, så en test kan
// kjøre den mot en ekte navigator uten å laste alle skjermene.
//
// Varsler finnes bare på iPhone (`canUsePush`), så dette kjører aldri på Android.
import {
  CommonActions,
  StackActions,
  type NavigationContainerRef,
} from '@react-navigation/native';
import type { RootStackParamList } from '../navigation';
import { openOrReturn, type BackNavigation } from './backTo';
import type { PushTarget } from './pushRoute';

export function openPushTarget(ref: NavigationContainerRef<RootStackParamList>, target: PushTarget) {
  // Ref-en har ikke `popTo` og `replace`, så de sendes som handlinger.
  const navigation: BackNavigation = {
    getState: () => ref.getRootState(),
    popTo: (name, params) => ref.dispatch(StackActions.popTo(name, params)),
    replace: (name, params) => ref.dispatch(StackActions.replace(name, params)),
    navigate: (name, params) => ref.dispatch(CommonActions.navigate(name, params)),
    reset: (state) => ref.dispatch(CommonActions.reset(state)),
  };

  if (target.name === 'GameHome') openOrReturn(navigation, 'GameHome', target.params);
  else if (target.name === 'Hole') {
    // #2268: the game's page under the hole, so «back» lands on the game.
    openOrReturn(navigation, 'GameHome', { gameId: target.params.gameId });
    openOrReturn(navigation, 'Hole', target.params);
  } else if (target.name === 'Leaderboard') {
    // #2632: spillets side under tavla, så «tilbake» lander på spillet.
    openOrReturn(navigation, 'GameHome', { gameId: target.params.gameId });
    openOrReturn(navigation, 'Leaderboard', target.params);
  } else if (target.name === 'League') openOrReturn(navigation, 'League', target.params);
  else if (target.name === 'Cup') openOrReturn(navigation, 'Cup', target.params);
  else if (target.name === 'LeagueRoundStart') {
    // #2675: ligasiden under startsiden, så «tilbake» lander på ligaen.
    openOrReturn(navigation, 'League', { leagueId: target.params.leagueId });
    openOrReturn(navigation, 'LeagueRoundStart', target.params);
  } else if (target.name === 'MarkerApprove') {
    // #2661: ligasiden under markørens skjerm, så «tilbake» lander på ligaen.
    openOrReturn(navigation, 'League', { leagueId: target.params.leagueId });
    openOrReturn(navigation, 'MarkerApprove', target.params);
  }
  // Uten mål: Hjem er bunnen av stakken. `navigate('Home')` ville lagt en ny
  // Hjem oppå, og tilbake derfra åpnet skjermen du sto på.
  else if (ref.canGoBack()) ref.dispatch(StackActions.popToTop());
}
