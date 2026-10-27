// #2228 (designlerretet, «Feilskjerm-forslag»): teksten på feilgrensens
// skjerm, og hvilken variant hver skjerm får. Finnes bare i appen og har ett
// hjem her.
//
// Tre varianter, valgt etter skjermen grensen står rundt:
//  - `game` (spillskjermene) har en linje til om at slagene er trygge. Den er
//    sann: `writeScore` lagrer raden i én SQLite-transaksjon før skjermen
//    leser på nytt, så et trykk som fikk svar, står på telefonen uansett hva
//    tegningen av skjermen gjør etterpå.
//  - `noBack` (Hjem og grensen rundt hele navigatoren) har ingen tilbakeknapp,
//    så teksten ber ikke om å gå tilbake.
//  - `default` for resten.

import type { RootStackParamList } from '../navigation';

export type ErrorBoundaryVariant = 'game' | 'noBack' | 'default';

export const ERROR_BOUNDARY_TEXT = {
  title: 'Noe gikk galt',
  body: 'Det skjedde en feil på denne skjermen. Prøv igjen, eller gå tilbake.',
  bodyNoBack: 'Det skjedde en feil på denne skjermen.',
  gameNote: 'Slagene du har tastet, ligger trygt på telefonen.',
  retry: 'Prøv igjen',
} as const;

/**
 * Varianten per skjerm i stacken. Kartet dekker hver rute, så en ny skjerm
 * feller `tsc` til noen har valgt variant for den, i stedet for å falle stille
 * til standarden. Spillskjermene, der slag tastes eller vises, får linja om at
 * slagene er trygge.
 */
const VARIANT_BY_ROUTE = {
  Home: 'noBack',
  CreateGame: 'default',
  GameHome: 'game',
  Hole: 'game',
  Scorecard: 'game',
  Leaderboard: 'game',
  HoleByHole: 'game',
  Approve: 'default',
  EndGame: 'default',
  Profile: 'default',
  EditProfile: 'default',
  DeleteAccount: 'default',
  AccountSettings: 'default',
  NotificationsAndTheme: 'default',
  Friends: 'default',
  FriendLink: 'default',
  RoundDiary: 'default',
  RoundStats: 'default',
  Kavalkade: 'default',
  League: 'default',
  LeagueRoundStart: 'default',
  MarkerApprove: 'default',
  SyncLab: 'default',
} as const satisfies Record<keyof RootStackParamList, ErrorBoundaryVariant>;

/** Varianten for grensen rundt en skjerm, etter navnet i stacken. */
export function errorBoundaryVariantFor(routeName: keyof RootStackParamList): ErrorBoundaryVariant {
  return VARIANT_BY_ROUTE[routeName];
}
