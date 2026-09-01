// native/app/src/lib/endGameCopy.ts
// Native N6c (#1856): fra typet avslag til en setning arrangøren kan lese, og
// de faste tekstene avslutt-skjermen viser.
//
// Samme arbeidsdeling som `rosterCopy.ts`: datalaget svarer med koder, skjermen
// viser tekst, oversettelsen bor ett sted. Ingen `default`-gren i switchen —
// legger noen til en kode i `EndRoundFailure`, faller `tsc` på den manglende
// returverdien. Det er hele grunnen til at fila finnes.
//
// **Én årsak, én setning.** Avslutningen kan avvises av femten forskjellige
// grunner, og de betyr helt ulike ting for arrangøren: «noen mangler
// godkjenning» løses av en medspiller, «du har ikke lov» løses ikke i appen i
// det hele tatt. Én generisk «noe gikk galt» over alle fjorten kostet N6b tre
// feilsøkingsrunder — den gjentas ikke her.
//
// **Ordforrådet er webbens der webben har et.** «Ingen kvalifiserte» og
// «Klarte ikke å lagre vinnerne. Prøv igjen.» er `admin.game.sideWinners.*`
// tegn for tegn; nett-linja deles med `rosterCopy.ts`. Slot-etikettene er
// derimot norske («Lengste drive #1»), som i appens egen matchplay-seksjon —
// webbens admin-skjema sier «Longest drive #1», og appen skal ikke bytte språk
// midt i en flyt.
import type { EndRoundFailure } from '../data/endGame';
import { OFFLINE_NOTE } from './rosterCopy';
import { fillCopy } from './sideTournamentCopy';
import type { FinishSlot } from './endGamePlan';

/** Fallbacken når serveren svarte med noe vi ikke har en egen setning for. */
const GENERIC_DB = 'Noe gikk galt mot serveren.';

/** «Ola, Kari og Per» — navn i en setning, ikke en punktliste. */
function nameList(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} og ${names[names.length - 1]!}`;
}

/**
 * Hvorfor avslutningen ikke gikk gjennom.
 *
 * @param reason koden fra `finishRound`.
 * @param names navnene bak `blockedUserIds` — skjermen slår dem opp i
 *   rosteret først, for datalaget kjenner bare id-er.
 * @param message serverens egen tekst, brukt kun som fallback ved `db`.
 */
export function describeEndRoundFailure(
  reason: EndRoundFailure,
  names: readonly string[] = [],
  message?: string,
): string {
  const who = nameList(names);
  switch (reason) {
    case 'no-session':
      return 'Du er ikke logget inn lenger. Logg inn på nytt.';
    case 'offline':
      return OFFLINE_NOTE;
    case 'not-found':
      return 'Fant ikke runden. Den er kanskje slettet.';
    case 'cup-game':
      return CUP_NOTE;
    case 'not-active':
      return 'Runden er ikke i gang lenger. Noen andre rakk kanskje å avslutte den.';
    case 'no-players':
      return 'Det står ingen spillere i runden.';
    case 'not-all-submitted':
      return who
        ? `${who} har fortsatt ikke levert. Kryss av, så avslutter du likevel.`
        : 'Noen har fortsatt ikke levert. Hent listen på nytt og prøv igjen.';
    case 'not-all-approved':
      return who
        ? `Kortet til ${who} mangler godkjenning. En medspiller må godkjenne før du avslutter.`
        : 'Et kort mangler godkjenning. En medspiller må godkjenne før du avslutter.';
    case 'withdrawal-unsupported':
      return 'I dette formatet kan du ikke trekke en spiller.';
    case 'withdraw-after-submit': {
      // Flertall endrer bare eiendelen — norsk bøyer ikke verbet etter antall.
      const cards = names.length > 1 ? 'kortene sine' : 'kortet sitt';
      const lead = who
        ? `${who} leverte ${cards} i mellomtiden`
        : 'Et kort kom inn i mellomtiden';
      // «ingen ble trukket» er ikke pynt: arrangøren MÅ vite at avkryssingen
      // ikke ble utført halvveis, ellers leter hen etter en trukket spiller
      // som ikke finnes.
      return `${lead}, så ingen ble trukket. Sjekk listen og prøv igjen.`;
    }
    case 'db-withdraw':
      return who
        ? `Fikk ikke trukket ${who}. Prøv igjen.`
        : 'Fikk ikke trukket spilleren. Prøv igjen.';
    case 'db-winners':
      return 'Klarte ikke å lagre vinnerne. Prøv igjen.';
    case 'rls-denied':
      return 'Du har ikke lov til å avslutte denne runden.';
    case 'no-rows':
      return 'Ingenting ble endret. Du har kanskje ikke tilgang, eller noen andre rakk det først.';
    case 'db':
      return message ?? GENERIC_DB;
  }
}

// -----------------------------------------------------------------------------
// Faste tekster
// -----------------------------------------------------------------------------

/**
 * Cup-runder. Står to steder: som note på spill-hjem i stedet for CTA-en, og
 * som avslag hvis noen likevel når fram til skrivingen.
 */
export const CUP_NOTE =
  'Denne runden hører til en cup. Den avslutter du på nettsiden, så cup-tavla følger med.';

/** Slot-etikettene. `{pos}` er hvilket HULL, aldri en plassering. */
const SLOT_LABELS: Record<FinishSlot['category'], string> = {
  longest_drive: 'Lengste drive #{pos}',
  closest_to_pin: 'Nærmest pinnen #{pos}',
};

/** «Lengste drive #1». */
export function slotLabel(slot: FinishSlot): string {
  return fillCopy(SLOT_LABELS[slot.category], { pos: slot.position });
}

/** Tekstene skjermen viser. Samlet her, ikke strødd i JSX-en. */
export const END_GAME_TEXT = {
  heading: 'Avslutt runden',
  loadFailed: 'Fikk ikke tak i runden. Sjekk nettet og prøv igjen.',
  notActive: 'Denne runden er ikke i gang, så det er ingenting å avslutte.',
  alreadyFinished: 'Runden er alt avsluttet.',
  deliveryHeading: 'Leveringer',
  submitted: 'Levert',
  notSubmitted: 'Ikke levert',
  approved: 'Godkjent',
  awaitingApproval: 'Venter på godkjenning',
  allReady:
    'Alle har levert. Avslutter du nå, låses runden og resultatene åpnes for hele gjengen.',
  missingHeading: 'Disse mangler kort',
  // Introen står over BEGGE radtypene, så den kan ikke si noe om hva slagene
  // gjør — de to radene svarer motsatt, og hver sin hint sier det selv.
  missingIntro: 'Huk av alle sammen, så kan du avslutte likevel.',
  withdrawLabel: 'Marker som trukket',
  // Trukket = ute av `buildModeResultForGame`s BÅDE spiller- og score-sett
  // (:308-334), altså ute av rangeringen OG sideturneringen. Radene i `scores`
  // slettes derimot aldri, og appen lar spilleren åpne sitt eget kort etterpå
  // (GameHome «Scorekort» er kun gatet på `supported`) — derfor «blir stående».
  withdrawHint:
    'Trukne spillere teller ikke i rangeringen. Slagene blir stående på scorekortet.',
  noCardLabel: 'Avslutt uten kortet',
  // IKKE samme sak: denne raden trekkes ikke, den avsluttes bare uten kort.
  // Spilleren er fortsatt med i rangeringen, så her teller slagene faktisk.
  // Webbens `game.finish.bodyWithWd` gjør nøyaktig samme todeling.
  noCardHint: 'Spilleren blir stående som ikke levert. Slagene teller fortsatt.',
  ownRowHint:
    'Deg selv kan du ikke trekke herfra. Det gjør du på nettsiden. Huker du av, avslutter du runden uten kortet ditt.',
  unapprovedHeading: 'Venter på godkjenning',
  unapprovedNote:
    'En medspiller må godkjenne hvert kort før du kan avslutte. Be dem åpne runden og godkjenne. Får du ikke tak i dem, godkjenner du på vegne av gruppa på nettsiden.',
  awardHeading: 'Kår vinnerne',
  awardIntro:
    'Velg hvem som tok hvert hull. Ingen som kvalifiserte? Si det, så står hullet som kåret uten vinner.',
  noQualified: 'Ingen kvalifiserte',
  submit: 'Avslutt runden',
  submitBusy: 'Avslutter …',
  confirmTitle: 'Avslutt runden?',
  confirmBody:
    'Resultatene låses og åpnes for alle. Skal runden åpnes igjen, må du gjøre det fra nettsiden.',
  confirmCta: 'Avslutt',
} as const;
