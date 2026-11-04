// native/app/src/lib/inboxCopy.ts
// #2759: tekstene i appens innboks.
//
// Samme arbeidsdeling som `friendsCopy.ts`: alt webbens `/innboks` også sier, er
// `messages/no.json → inbox` tegn for tegn, og `inboxCopy.test.ts` leser den fila og
// sammenligner. Radene selv (tittel, underlinje) kommer ferdige fra serveren.
//
// App-egent: linjene for nett og lasting (webben kan ikke være offline) og
// etiketten på knappen på Hjem.
import { firstName } from '../../../../lib/firstName';

export const INBOX_TEXT = {
  heading: 'Innboks',
  markAll: 'Marker alt lest',
  clearRead: 'Tøm leste',
  filterLabel: 'Vis varsler',
  filterAll: 'Alle',
  filterAction: 'Krever handling',
  filterFriends: 'Venner',
  sections: { action: 'Krever handling', today: 'I dag', earlier: 'Tidligere' },
  buttons: {
    review: 'Se over',
    deliver: 'Lever',
    enterScore: 'Før slaget',
    fixCard: 'Rett kortet',
    reply: 'Svar',
    inviteNew: 'Inviter ny',
    confirm: 'Bekreft',
    seeMissing: 'Se hva som mangler',
    seePayment: 'Se betaling',
    finishGame: 'Avslutt spillet',
    playRound: 'Spill runden',
  },
  approve: 'Godta',
  reject: 'Avslå',
  unread: 'Ulest',
  emptyHeading: 'Ingen nye varsler.',
  emptyBody: 'Når noen inviterer deg, leverer kort eller avslutter et spill du er med i, dukker varselet opp her.',
  cleanPullQuote: 'Innboksen er ren.',
  emptyFilter: 'Ingenting her nå.',
  actionFailed: 'Fikk ikke lagret — prøv igjen.',
  somePlayer: 'En spiller',
  alreadyDecided: 'Den er allerede avgjort',
  forbidden: 'Du har ikke tilgang til å svare på denne påmeldingen.',
  gameLocked: 'Spillet er startet eller avsluttet. Påmeldinger kan ikke endres lenger.',
  noTeamSlot: 'Spillet har ingen ledige lag igjen.',
  // --- App-egent ---------------------------------------------------------
  offline: 'Du må være på nett for å se innboksen. Koble til og prøv igjen.',
  loadFailed: 'Fikk ikke hentet innboksen. Prøv igjen.',
  retry: 'Prøv igjen',
} as const;

/** «Krever handling · 3», og uten tall ved 0 (brikka virker fortsatt). */
export function actionChipLabel(count: number): string {
  return count > 0 ? `${INBOX_TEXT.filterAction} · ${count}` : INBOX_TEXT.filterAction;
}

/** Statuslinja etter «Godta» og «Avslå», webbens `inbox.status.*`. */
export function decidedLine(
  outcome: 'approved' | 'rejected',
  values: { name: string | null; teamName: string | null; gameName: string },
): string {
  const name = values.name ? (firstName(values.name) ?? values.name) : INBOX_TEXT.somePlayer;
  if (outcome === 'approved') {
    return values.teamName
      ? `Lag ${values.teamName} er med i ${values.gameName}`
      : `${name} er med i ${values.gameName}`;
  }
  return values.teamName
    ? `Lag ${values.teamName} fikk beskjed om at det ble nei`
    : `${name} fikk beskjed om at det ble nei`;
}

/** Knappen på Hjem. Skjermleseren får tallet i klartekst. */
export function inboxButtonLabel(unread: number): string {
  if (unread <= 0) return INBOX_TEXT.heading;
  return `${INBOX_TEXT.heading}, ${unread} ${unread === 1 ? 'ulest' : 'uleste'}`;
}
