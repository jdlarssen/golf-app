// native/app/src/lib/inboxCopy.ts
// #2759: tekstene på innboksen i appen.
//
// Samme arbeidsdeling som `friendsCopy.ts`: alt nettets `/innboks` også sier, er
// `messages/no.json → inbox` tegn for tegn, og `inboxCopy.test.ts` leser den
// fila og sammenligner. Selve radene skriver serveren (`GET /api/inbox`). Her
// står bare det rundt dem: brikkene, seksjonene, knappene og statuslinjene.
//
// App-egent er merket under: linjene for nett og lasting (nettsiden kan ikke
// være uten nett) og konvolutten på Hjem (eierens svar 02.11).
import type { ActionKey } from '../../../../lib/notifications/inboxSections';

export const INBOX_TEXT = {
  // --- Nettets ordlyd (messages/no.json → inbox) --------------------------
  kicker: 'Innboks',
  markAllAsRead: 'Marker alt lest',
  clearRead: 'Tøm leste',
  actionFailed: 'Fikk ikke lagret — prøv igjen.',
  emptyHeading: 'Ingen nye varsler.',
  emptyBody:
    'Når noen inviterer deg, leverer kort eller avslutter et spill du er med i, dukker varselet opp her.',
  cleanPullQuote: 'Innboksen er ren.',
  emptyFilter: 'Ingenting her nå.',
  unreadLabel: 'Ulest',
  somePlayerFallback: 'En spiller',
  filters: {
    label: 'Vis varsler',
    all: 'Alle',
    action: 'Krever handling',
    actionCount: 'Krever handling · {count}',
    friends: 'Venner',
  },
  sections: {
    action: 'Krever handling',
    today: 'I dag',
    earlier: 'Tidligere',
  },
  buttons: {
    review: 'Se over',
    approve: 'Godta',
    reject: 'Avslå',
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
  status: {
    approved: '{name} er med i {gameName}',
    approvedTeam: 'Lag {teamName} er med i {gameName}',
    rejected: '{name} fikk beskjed om at det ble nei',
    rejectedTeam: 'Lag {teamName} fikk beskjed om at det ble nei',
    alreadyDecided: 'Den er allerede avgjort',
    forbidden: 'Du har ikke tilgang til å svare på denne påmeldingen.',
  },
  // --- Nettets ordlyd (messages/no.json → admin.game.signups.errors) ------
  signupErrors: {
    game_locked: 'Spillet er startet eller avsluttet. Påmeldinger kan ikke endres lenger.',
    no_team_slot: 'Spillet har ingen ledige lag igjen.',
  },
  // --- App-egent ----------------------------------------------------------
  offline: 'Du må være på nett for å se innboksen. Koble til og prøv igjen.',
  loadFailed: 'Fikk ikke hentet innboksen. Prøv igjen.',
  retry: 'Prøv igjen',
} as const;

/** Knappen på en rad som ikke svarer på en påmelding. */
export function actionButtonLabel(key: Exclude<ActionKey, 'decide'>): string {
  return INBOX_TEXT.buttons[key];
}

/** «Krever handling · 2», og uten tall ved 0. */
export function actionFilterLabel(count: number): string {
  return count > 0
    ? INBOX_TEXT.filters.actionCount.replace('{count}', String(count))
    : INBOX_TEXT.filters.action;
}

/** Statuslinja etter «Godta» eller «Avslå». Serveren sier utfallet, og navnene kommer derfra. */
export function decisionLine(decision: {
  outcome: 'approved' | 'rejected';
  name: string | null;
  gameName: string;
  teamName: string | null;
}): string {
  const { status } = INBOX_TEXT;
  const template = decision.teamName
    ? decision.outcome === 'approved'
      ? status.approvedTeam
      : status.rejectedTeam
    : decision.outcome === 'approved'
      ? status.approved
      : status.rejected;
  return template
    .replace('{name}', decision.name ?? INBOX_TEXT.somePlayerFallback)
    .replace('{teamName}', decision.teamName ?? '')
    .replace('{gameName}', decision.gameName);
}

/** Konvolutten på Hjem, for skjermleseren: tallet i klartekst. */
export function inboxButtonA11yLabel(unread: number): string {
  if (unread <= 0) return INBOX_TEXT.kicker;
  return `${INBOX_TEXT.kicker}, ${unread} ${unread === 1 ? 'ulest' : 'uleste'}`;
}
