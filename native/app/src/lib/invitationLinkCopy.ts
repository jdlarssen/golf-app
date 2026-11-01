// native/app/src/lib/invitationLinkCopy.ts
// #2748: tekstene når invitasjonsmailen åpner appen. Gir invitasjonen et spill, går
// skjermen rett videre, så det meste her er for når den ikke gjør det.
import type { InvitationLinkFailure } from '../data/invitationLink';
import { OFFLINE_NOTE } from './rosterCopy';
import { WEB_LINK_TEXT } from './webLink';

export const INVITATION_LINK_TEXT = {
  kicker: 'Invitasjon',
  opening: 'Åpner invitasjonen …',
  /** Nesten ordrett `onboarding.inviteNoticeGameStarted`, uten innloggingen: her er du logget inn. */
  started: 'Runden du ble invitert til, har allerede startet, så du står ikke på lista. Si fra til den som inviterte deg.',
  noGame: 'Invitasjonen gjelder ingen runde du kan åpne nå. Spør den som inviterte deg.',
  otherAccount:
    'Invitasjonen er sendt til en annen e-postadresse enn den du er logget inn med. Logg inn med den adressen, så finner du runden.',
  notFound: 'Fant ikke invitasjonen. Lenken kan være feil.',
  openFailed: 'Fikk ikke åpnet invitasjonen. Sjekk nettet og prøv igjen.',
  toHome: 'Til Hjem',
  retry: 'Prøv igjen',
  /** Linja i innloggingsbåndet når en invitasjon venter. Runden vises ikke før innloggingen. */
  loginTitle: 'Logg inn for å åpne invitasjonen',
  loginBody: 'Etterpå kommer du rett til runden.',
} as const;

/** Feilen når kallet ikke gikk. Uttømmende: en ny kode faller på `tsc`. */
export function describeInvitationLinkFailure(reason: InvitationLinkFailure): string {
  switch (reason) {
    case 'offline':
      return OFFLINE_NOTE;
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return 'Logg inn på nytt og prøv igjen.';
    case 'network':
    case 'open_failed':
      return INVITATION_LINK_TEXT.openFailed;
  }
}
