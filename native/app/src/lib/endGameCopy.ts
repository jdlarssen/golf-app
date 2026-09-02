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
// Kun typen: `data/remind.ts` drar med seg supabase-klienten og sync-triggerne,
// og en copy-modul skal ikke koble på noe av det. `import type` forsvinner i
// kompileringen, så koden her er fortsatt ren tekst.
import type { ReminderFailure } from '../data/remind';
import { OFFLINE_NOTE } from './rosterCopy';
import { fillCopy } from './sideTournamentCopy';
import { WEB_LINK_TEXT } from './webLink';
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

/**
 * Knappen som står under {@link CUP_NOTE} (#1891).
 *
 * Noten sto i to år uten vei videre — «på nettsiden» uten å si hvor. Etiketten
 * og stien bor sammen med noten fordi begge kallstedene (avslutt-skjermen og
 * arrangør-seksjonen) skal sende arrangøren til den SAMME siden; to inline
 * strenger ville drevet fra hverandre ved første ruteendring.
 */
export const CUP_LINK_LABEL = 'Åpne cupen';

/**
 * Cup-forsiden på webben.
 *
 * `encodeURIComponent` selv om id-en er en uuid fra vår egen bundle: en sti
 * bygget av data kodes der den bygges, ikke der noen senere antar at den var
 * trygg (samme regel som `remindPath` i `data/remind.ts`).
 */
export function cupWebPath(tournamentId: string): string {
  return `/cup/${encodeURIComponent(tournamentId)}`;
}

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
  // #1891: siste setning pekte til nettsiden fordi appen ikke HADDE
  // overstyringen. Nå har den den (godkjenn-knappen under), og henvisningen er
  // dermed en blindvei som beskriver en app som ikke finnes lenger.
  unapprovedNote:
    'En medspiller må godkjenne hvert kort før du kan avslutte. Be dem åpne runden og godkjenne — eller godkjenn på vegne av gruppa her.',
  /** Både knappe-etiketten og tittelen i bekreftelsen — det er samme handling. */
  approveOnBehalf: 'Godkjenn på vegne av gruppa',
  approveConfirmCta: 'Godkjenn',
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

// -----------------------------------------------------------------------------
// Purring (#1889)
// -----------------------------------------------------------------------------

/**
 * Malene med innsatte tall. De ligger UTENFOR {@link END_GAME_TEXT} med vilje:
 * testen der krever ferdige setninger uten `{}`, og en halvferdig mal i den
 * tabellen ville vært nøyaktig den feilen testen finnes for å hindre.
 */
const REMIND_LABEL = 'Purr på dem som mangler ({n})';
const STILL_PLAYING_NOTE =
  '{m} av dem har ikke ført alle hullene ennå. Purring hjelper først da.';
const LAST_REMINDED_NOTE = 'Sist purret kl. {clock}';
const APPROVE_CONFIRM_BODY =
  'Godkjenn kortet til {name}? Du står som den som godkjente.';

/**
 * Knappeteksten med antallet purringen faktisk treffer.
 *
 * Tallet står i etiketten og ikke i en egen linje fordi det ER handlingens
 * omfang: «Purr på dem som mangler» uten tall lover noe annet enn den gjør når
 * to av fem fortsatt spiller.
 */
export function remindLabel(targets: number): string {
  return fillCopy(REMIND_LABEL, { n: targets });
}

/**
 * Linja om dem purringen IKKE treffer.
 *
 * Serveren purrer bare spillere som er ferdige uten å ha levert
 * (`selectDeliveryReminderTargets`). Resten står midt i runden, og en purring
 * til dem er støy. Setningen sier hvorfor tallet på knappen er lavere enn
 * lista over — uten den ser differansen ut som en feil.
 */
export function stillPlayingNote(count: number): string {
  return fillCopy(STILL_PLAYING_NOTE, { m: count });
}

/**
 * «Sist purret kl. 14.05».
 *
 * @param clock klokkeslettet fra `formatClock` (`lib/display.ts`) — enhetens
 *   egen tid, aldri en Oslo-konvertering (Hermes har ingen ICU-tidssoner).
 *
 * Dette er det eneste som står mellom arrangøren og en dobbeltpurring:
 * eieren valgte bort en sperre, så linja ER guardrailen.
 */
export function lastRemindedNote(clock: string): string {
  return fillCopy(LAST_REMINDED_NOTE, { clock });
}

/** «Godkjenn kortet til Kari? Du står som den som godkjente.» */
export function approveConfirmBody(name: string): string {
  return fillCopy(APPROVE_CONFIRM_BODY, { name });
}

/**
 * Hvorfor purringen ikke gikk gjennom.
 *
 * Fire av kodene har hver sin setning fordi de krever fire helt ulike ting av
 * arrangøren: koble til nett, logge inn på nytt, innse at runden er lukket,
 * eller ta kontakt med den som bygde appen. Resten («ikke arrangør», «fant
 * ikke runden», nettverksfeil, serverfeil) ender i samme «prøv igjen» — de er
 * alle utenfor arrangørens kontroll her og nå, og fire varianter av samme
 * råd hjelper ingen.
 *
 * Ingen `default`-gren: legger ruta til en kode i `ReminderFailure`, faller
 * `tsc` på den manglende returverdien.
 */
export function describeReminderFailure(reason: ReminderFailure): string {
  switch (reason) {
    case 'offline':
      return 'Purring krever nett.';
    // Delt med lenke-knappene: den samme mangelen i bygget stopper begge, og
    // meldingen skal ikke nevne én av dem. Slette-flyten har sin egen, mer
    // spesifikke variant (`accountCopy.ts`) som navngir kontoen.
    case 'no-web-base-url':
      return WEB_LINK_TEXT.missingBaseUrl;
    case 'unauthorized':
      return 'Logg inn på nytt og prøv igjen.';
    // Samme setning som skjermens egen «ikke i gang»-tilstand: runden er
    // lukket, og da er det ingenting å purre på.
    case 'not_active':
      return END_GAME_TEXT.notActive;
    case 'network':
    case 'forbidden':
    case 'not_found':
    case 'remind_failed':
      return 'Fikk ikke purret. Prøv igjen.';
  }
}

/** Kvitteringen. Sier at varselet er sendt, ikke at det er lest. */
export const REMIND_DONE_NOTE = 'Purret. De får et varsel nå.';

/** Knappen mens kallet pågår — den er `disabled` i samme tilstand. */
export const REMIND_BUSY_LABEL = 'Purrer …';

/**
 * Samme jobb for GET-en som henter antallet.
 *
 * De fire kodene som beskriver appens egen tilstand (uten nett, uten adresse,
 * uten sesjon, lukket runde) betyr det samme uansett hvilket av de to kallene
 * som feilet, og gjenbrukes derfor uendret. Resten gjør det ikke: «Fikk ikke
 * purret» etter en feilet forhåndssjekk sier at et forsøk gikk galt, og det
 * skjedde aldri noe forsøk. Arrangøren ville lett etter en purring som ikke
 * finnes.
 */
export function describeReminderPreviewFailure(reason: ReminderFailure): string {
  switch (reason) {
    case 'network':
    case 'forbidden':
    case 'not_found':
    case 'remind_failed':
      return 'Fikk ikke sjekket hvem som kan purres. Prøv igjen.';
    case 'offline':
    case 'no-web-base-url':
    case 'unauthorized':
    case 'not_active':
      return describeReminderFailure(reason);
  }
}
