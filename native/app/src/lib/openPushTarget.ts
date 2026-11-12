// native/app/src/lib/openPushTarget.ts
// #2746: et trykk på et varsel åpner skjermen `pushTarget` peker på (#2256 PR 4).
//
// Varslene følger samme regel som skjermene (`docs/user-flows.md` §Tilbake):
// ligger spillet eller ligaen alt i stakken, går trykket tilbake dit i stedet
// for å legge en kopi oppå. Står her og ikke i `navigation.tsx`, så en test kan
// kjøre den mot en ekte navigator uten å laste alle skjermene.
//
// #2759: innboksen åpner de samme skjermene (`openScreenTarget`), med sin egen
// `navigation`, så et trykk på samme varsel gir samme stakk fra begge.
import {
  CommonActions,
  StackActions,
  type NavigationContainerRef,
} from '@react-navigation/native';
import type { RootStackParamList } from '../navigation';
import { openOrReturn, type BackNavigation } from './backTo';
import type { PushTarget } from './pushRoute';

/** En skjerm å åpne, altså alt annet enn «Hjem» (bunnen av stakken). */
export type ScreenTarget = Exclude<PushTarget, { name: 'Home' }>;

/**
 * Åpner målet, med skjermen over i hierarkiet under, så «tilbake» lander der.
 * Tar aldri stakken ned til Hjem: et trykk i innboksen skal lande i innboksen.
 */
export function openScreenTarget(navigation: BackNavigation, target: ScreenTarget) {
  // #2268, #2632, #2759: spillets side under skjermen, så «tilbake» lander på spillet.
  const game = (gameId: string) => openOrReturn(navigation, 'GameHome', { gameId });
  // #2675, #2661: ligasiden under skjermen, så «tilbake» lander på ligaen.
  const league = (leagueId: string) => openOrReturn(navigation, 'League', { leagueId });

  if (target.name === 'GameHome') openOrReturn(navigation, 'GameHome', target.params);
  else if (target.name === 'Hole') {
    game(target.params.gameId);
    openOrReturn(navigation, 'Hole', target.params);
  } else if (target.name === 'Leaderboard') {
    game(target.params.gameId);
    openOrReturn(navigation, 'Leaderboard', target.params);
  } else if (target.name === 'Approve') {
    game(target.params.gameId);
    openOrReturn(navigation, 'Approve', target.params);
  } else if (target.name === 'Scorecard') {
    game(target.params.gameId);
    openOrReturn(navigation, 'Scorecard', target.params);
  } else if (target.name === 'EndGame') {
    game(target.params.gameId);
    openOrReturn(navigation, 'EndGame', target.params);
  } else if (target.name === 'Friends') openOrReturn(navigation, 'Friends', target.params);
  else if (target.name === 'RoundStats') openOrReturn(navigation, 'RoundStats');
  else if (target.name === 'League') openOrReturn(navigation, 'League', target.params);
  else if (target.name === 'Cup') openOrReturn(navigation, 'Cup', target.params);
  else if (target.name === 'CupParticipants') {
    // #2752: cup-rommet under spillerlista, så «tilbake» lander på cupen.
    openOrReturn(navigation, 'Cup', { cupId: target.params.cupId });
    openOrReturn(navigation, 'CupParticipants', target.params);
  } else if (target.name === 'RoundInvite') {
    // #2840: påmeldingssiden, der lagskjemaet og svaret på invitasjonen står.
    openOrReturn(navigation, 'RoundInvite', target.params);
  } else if (target.name === 'TeamPage') {
    // #2840 del 3: lagvarslene åpner lagsiden.
    openOrReturn(navigation, 'TeamPage', target.params);
  } else if (target.name === 'LeagueRoundStart') {
    league(target.params.leagueId);
    openOrReturn(navigation, 'LeagueRoundStart', target.params);
  } else {
    league(target.params.leagueId);
    openOrReturn(navigation, 'MarkerApprove', target.params);
  }
}

export function openPushTarget(ref: NavigationContainerRef<RootStackParamList>, target: PushTarget) {
  if (target.name === 'Home') {
    // Uten mål: Hjem er bunnen av stakken. `navigate('Home')` ville lagt en ny
    // Hjem oppå, og tilbake derfra åpnet skjermen du sto på.
    if (ref.canGoBack()) ref.dispatch(StackActions.popToTop());
    return;
  }
  // Ref-en har ikke `popTo` og `replace`, så de sendes som handlinger.
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
}
