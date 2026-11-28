// native/app/src/lib/moderationCopy.ts
// #3019: rapportere, blokkere, vilkårene og «Kontakt oss» i appen (Apples
// regel 1.2 og Google Plays regel om brukerskapt innhold). Ordene er
// tegningenes fra fase 1 (designlerretet, rad 159400, «Rapporter og blokker»),
// godkjent av eieren 28.11 («Ja, bygg med 1A»).
//
// Vilkårenes egen tekst står på nettsiden (`/legal/vilkar`, messages →
// legal.terms); spørsmålet her er kortversjonen fra tegning 15.
import type { ReportReason } from '../../../../lib/moderation/reportInput';

/** Fornavnet, til «Rapporter Kristian» og «Blokker Kristian også». */
export function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || name;
}

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  offensive: 'Støtende navn eller tekst',
  harassment: 'Trakassering',
  other: 'Noe annet',
};

export const MODERATION_TEXT = {
  // Inngangene (tegning 1A, 7 og 9)
  entryPerson: 'Rapporter eller blokker',
  entryRound: 'Rapporter runden',
  entryGame: 'Rapporter eller blokker',

  // Arket fra en person (tegning 2)
  chooseTitle: 'Rapporter eller blokker',
  cancel: 'Avbryt',

  // Rapporten (tegning 3 og 8)
  reasonHeading: 'Hva gjelder det?',
  noteLabel: 'Fortell mer (valgfritt)',
  notePlaceholder: 'Hva har skjedd?',
  send: 'Send rapport',
  sending: 'Sender …',
  roundTitle: 'Rapporter runden',
  roundAnonymous: 'Arrangøren får ikke vite hvem som har rapportert.',

  // Startbilletten (tegning 10)
  pickTitle: 'Hva vil du si fra om?',
  pickRound: 'Runden',
  pickRoundSub: 'Navnet, premiene eller noe annet i runden',
  pickPlayers: 'En spiller',

  // Kvitteringene (tegning 5 og 6)
  reportedTitle: 'Takk, rapporten er sendt',
  reportedBody: 'Vi ser på den innen 24 timer.',
  done: 'Ferdig',

  // Blokkering (tegning 4)
  blockConfirm: 'Blokker',
  blocking: 'Blokkerer …',

  // Lista «Blokkerte» (tegning 11, 12 og 13)
  blockedRow: 'Blokkerte',
  blockedTitle: 'Blokkerte',
  blockedLede:
    'De kan ikke legge deg til i runder eller cuper, og ikke sende deg venneforespørsel. De får ikke vite at du har blokkert dem.',
  blockedNote: 'Runder dere alt er med i sammen, står som før.',
  blockedEmpty: 'Ingen er blokkert.',
  unblock: 'Opphev',
  unblocking: 'Opphever …',
  unblockTitle: 'Oppheve blokkeringen?',
  blockedLoadFailed: 'Fikk ikke hentet lista. Prøv igjen.',
  retry: 'Prøv igjen',
  blockedBack: 'Tilbake til Personvern og konto',

  // «Kontakt oss» (tegning 11)
  helpSection: 'Hjelp',
  contactRow: 'Kontakt oss',
  contactFailed: 'Fikk ikke åpnet e-posten. Skriv til personvern@tornygolf.no.',

  // Vilkårene (tegning 15)
  termsTitle: 'Før første utslag',
  termsBody1:
    'Tørny har noen få regler. Ikke skriv noe støtende i navn, rundenavn eller premier, og ikke plag andre spillere.',
  termsBody2:
    'Bryter noen reglene, kan Tørny fjerne det de har skrevet eller slette kontoen deres.',
  termsBody3:
    'Ser du noe som ikke hører hjemme her, kan du rapportere det fra personen eller runden. Vi ser på alle rapporter innen 24 timer.',
  termsRead: 'Les hele vilkårene',
  termsAccept: 'Jeg godtar',
  termsDecline: 'Nei, logg meg ut',
  termsSaving: 'Lagrer …',
  termsSaveFailed: 'Fikk ikke lagret svaret. Prøv igjen.',
} as const;

/** «Rapporter Kristian» i arket fra en person. */
export function reportPersonLabel(name: string): string {
  return `Rapporter ${firstNameOf(name)}`;
}
export const REPORT_PERSON_SUB = 'Si fra om et støtende navn eller trakassering.';

/** «Blokker Kristian» i arket fra en person. */
export function blockPersonLabel(name: string): string {
  return `Blokker ${firstNameOf(name)}`;
}
export function blockPersonSub(name: string): string {
  return `${firstNameOf(name)} kan ikke legge deg til i runder eller sende deg venneforespørsel.`;
}

/** «Rapporter Kristian Holm» øverst i rapporten. */
export function reportPersonTitle(name: string): string {
  return `Rapporter ${name}`;
}
export function reportPersonAnonymous(name: string): string {
  return `${firstNameOf(name)} får ikke vite hvem som har rapportert.`;
}
export function alsoBlockLabel(name: string): string {
  return `Blokker ${firstNameOf(name)} også`;
}

/** Spørsmålet før blokkering (tegning 4). */
export function blockConfirmTitle(name: string): string {
  return `Blokker ${name}?`;
}
export function blockConfirmMessage(name: string): string {
  const first = firstNameOf(name);
  return `Da er dere ikke venner lenger, og ${first} kan ikke legge deg til i runder eller cuper. ${first} får ikke beskjed.`;
}

/** Kvitteringen etter blokkering (tegning 6). */
export function blockedTitle(name: string): string {
  return `${name} er blokkert`;
}
export const BLOCKED_BODY = 'Du kan oppheve blokkeringen under «Personvern og konto» i profilen.';

/** Rapport med «Blokker … også» på: kvitteringen sier begge deler. */
export function reportedAndBlockedBody(name: string): string {
  return `Vi ser på den innen 24 timer. ${name} er også blokkert.`;
}

/** Spørsmålet før «Opphev» (tegning 13). */
export function unblockMessage(name: string): string {
  return `${name} kan igjen legge deg til i runder. Dere blir ikke venner igjen av seg selv.`;
}

/** «2 personer» under raden «Blokkerte». */
export function blockedCountLabel(count: number): string {
  if (count === 0) return 'Ingen';
  return count === 1 ? '1 person' : `${count} personer`;
}

/** «Blokkert 28. november» på en rad i lista. */
const MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];
export function blockedOnLabel(iso: string): string {
  const d = new Date(iso);
  const day = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', day: 'numeric' }).format(d),
  );
  const month = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', month: 'numeric' }).format(d),
  );
  return `Blokkert ${day}. ${MONTHS[month - 1]}`;
}

export type ReportFailure = 'offline' | 'invalid' | 'rate_limited' | 'failed';

/** Linja over «Send rapport» når rapporten ikke gikk. */
export function describeReportFailure(reason: ReportFailure): string {
  switch (reason) {
    case 'offline':
      return 'Du er uten nett. Prøv igjen når du har dekning.';
    case 'invalid':
      return 'Fant ikke det du rapporterer. Det kan være slettet.';
    case 'rate_limited':
      return 'Du har sendt mange rapporter i dag. Prøv igjen i morgen.';
    case 'failed':
      return 'Fikk ikke sendt rapporten. Prøv igjen.';
  }
}

export type BlockFailure = 'offline' | 'failed';

export function describeBlockFailure(reason: BlockFailure): string {
  return reason === 'offline'
    ? 'Du er uten nett. Prøv igjen når du har dekning.'
    : 'Fikk ikke lagret. Prøv igjen.';
}
