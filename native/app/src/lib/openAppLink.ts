// native/app/src/lib/openAppLink.ts
// #2748: lenka som åpnet appen, åpner skjermen sin.
//
// Skjermen legges oppå det som står åpent, så tilbake går dit du sto. Åpnet lenka
// appen, går tilbake til Hjem (regel 1 i `docs/user-flows.md` §Tilbake, med
// unntaket). Står her og ikke i `navigation.tsx`, så en test kan kjøre den mot en
// ekte navigator uten å laste alle skjermene (som `openPushTarget`).
import { StackActions, type NavigationContainerRef } from '@react-navigation/native';
import { appLinkScreen } from '../data/pendingAppLink';
import type { RootStackParamList } from '../navigation';
import type { AppLink } from './appLinkUrl';

export function openAppLink(ref: NavigationContainerRef<RootStackParamList>, link: AppLink) {
  const screen = appLinkScreen(link);
  ref.dispatch(StackActions.push(screen.name, screen.params));
}
