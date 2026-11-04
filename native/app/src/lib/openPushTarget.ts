// native/app/src/lib/openPushTarget.ts
// #2746: et trykk på et varsel åpner skjermen `pushTarget` peker på (#2256 PR 4).
//
// Varslene følger samme regel som skjermene (`docs/user-flows.md` §Tilbake):
// ligger spillet eller ligaen alt i stakken, går trykket tilbake dit i stedet
// for å legge en kopi oppå. Står her og ikke i `navigation.tsx`, så en test kan
// kjøre den mot en ekte navigator uten å laste alle skjermene.
//
// Innboksen (#2759) åpner de samme målene med `openScreenTarget`, så et varsel
// fører til samme sted, med samme skjerm under, fra begge kanter. Den har ingen
// vei til Hjem: en sti uten skjerm i appen åpner nettsiden (`inboxTarget.ts`).
import {
  CommonActions,
  StackActions,
  type NavigationContainerRef,
} from '@react-navigation/native';
import type { RootStackParamList } from '../navigation';
import { openOrReturn, type BackNavigation } from './backTo';
import type { PushTarget, ScreenTarget } from './pushRoute';

/** Skjermen målet peker på, med skjermen over i hierarkiet under seg. */
export function openScreenTarget(navigation: BackNavigation, target: ScreenTarget) {
  switch (target.name) {
    case 'GameHome':
      openOrReturn(navigation, 'GameHome', target.params);
      return;
    case 'Hole':
    case 'Leaderboard':
    case 'Approve':
    case 'Scorecard':
    case 'EndGame':
      // #2268, #2632, #2759: spillets side under, så «tilbake» lander på
      // spillet, og et levert kort har spillet å gå tilbake til.
      openOrReturn(navigation, 'GameHome', { gameId: target.params.gameId });
      openGameScreen(navigation, target);
      return;
    case 'League':
      openOrReturn(navigation, 'League', target.params);
      return;
    case 'Cup':
      openOrReturn(navigation, 'Cup', target.params);
      return;
    case 'CupParticipants':
      // #2752: cup-rommet under spillerlista, så «tilbake» lander på cupen.
      openOrReturn(navigation, 'Cup', { cupId: target.params.cupId });
      openOrReturn(navigation, 'CupParticipants', target.params);
      return;
    case 'LeagueRoundStart':
      // #2675: ligasiden under startsiden, så «tilbake» lander på ligaen.
      openOrReturn(navigation, 'League', { leagueId: target.params.leagueId });
      openOrReturn(navigation, 'LeagueRoundStart', target.params);
      return;
    case 'MarkerApprove':
      // #2661: ligasiden under markørens skjerm, så «tilbake» lander på ligaen.
      openOrReturn(navigation, 'League', { leagueId: target.params.leagueId });
      openOrReturn(navigation, 'MarkerApprove', target.params);
      return;
    case 'Friends':
      openOrReturn(navigation, 'Friends', target.params);
      return;
    case 'RoundStats':
      openOrReturn(navigation, 'RoundStats');
      return;
  }
}

function openGameScreen(
  navigation: BackNavigation,
  target: Extract<ScreenTarget, { name: 'Hole' | 'Leaderboard' | 'Approve' | 'Scorecard' | 'EndGame' }>,
) {
  switch (target.name) {
    case 'Hole':
      openOrReturn(navigation, 'Hole', target.params);
      return;
    case 'Leaderboard':
      openOrReturn(navigation, 'Leaderboard', target.params);
      return;
    case 'Approve':
      openOrReturn(navigation, 'Approve', target.params);
      return;
    case 'Scorecard':
      openOrReturn(navigation, 'Scorecard', target.params);
      return;
    case 'EndGame':
      openOrReturn(navigation, 'EndGame', target.params);
      return;
  }
}

export function openPushTarget(ref: NavigationContainerRef<RootStackParamList>, target: PushTarget) {
  // Uten mål: Hjem er bunnen av stakken. `navigate('Home')` ville lagt en ny
  // Hjem oppå, og tilbake derfra åpnet skjermen du sto på.
  if (target.name === 'Home') {
    if (ref.canGoBack()) ref.dispatch(StackActions.popToTop());
    return;
  }
  // Ref-en har ikke `popTo` og `replace`, så de sendes som handlinger.
  const navigation: BackNavigation = {
    getState: () => ref.getRootState(),
    popTo: (name, params) => ref.dispatch(StackActions.popTo(name, params)),
    replace: (name, params) => ref.dispatch(StackActions.replace(name, params)),
    navigate: (name, params) => ref.dispatch(CommonActions.navigate(name, params)),
    reset: (state) => ref.dispatch(CommonActions.reset(state)),
  };
  openScreenTarget(navigation, target);
}
