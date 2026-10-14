// #2577: tekstene på godkjenningen, ordrett fra designlerretet (rad 68
// «Godkjenningen i appen»). Samme arbeidsdeling som de andre `*Copy.ts`:
// skjermen viser, teksten bor her.
import { formatNameList } from './display';

export const APPROVE_TEXT = {
  /** Skjermens navn for systemet (tilbake-menyen på neste skjerm). */
  screenTitle: 'Godkjenn',
  loading: 'Henter kortene …',
  empty: 'Ingenting å godkjenne akkurat nå.',
  noScores: 'Ingen slag synlige på denne enheten.',
  intro: 'Sjekk slagene mot det du så på banen. Handicapen regner appen ut selv.',
  approve: 'Godkjenn',
  sendBack: 'Send tilbake',
  working: 'Jobber …',
  /** Seksjonene, skrevet med `ui.kicker` (versaler). */
  waitingAlso: 'Venter også',
  approvedByYou: 'Du har godkjent',
  notDeliveredYet: 'Ikke levert ennå',
  yourCard: 'Ditt kort',
  review: 'Se over',
  strokes: 'slag',
  notDeliveredHint: 'Du får beskjed når kortet kommer.',
  allApprovedTitle: 'Alle kortene er godkjent',
  nothingWaitingTitle: 'Ingen kort venter på deg',
  seeBoard: 'Se tavla',
  backToGame: 'Tilbake til spillet',
  reasonLabel: 'Grunn (valgfri)',
  cancel: 'Avbryt',
} as const;

/** «2 kort venter på deg». */
export function pendingHeading(count: number): string {
  return `${count} kort venter på deg`;
}

/** Plassen til det åpne kortet: «1 av 2». */
export function positionLabel(index: number, count: number): string {
  return `${index} av ${count}`;
}

/** «Levert 14:35», og antall slag bak når enheten ser noen (beslutning 3). */
export function deliveredLine(clock: string | null, strokes: number | null): string {
  const head = clock ? `Levert ${clock}` : 'Levert';
  return strokes == null ? head : `${head} · ${strokes} ${APPROVE_TEXT.strokes}`;
}

/** «Godkjent 14:41». */
export function approvedLine(clock: string | null): string {
  return clock ? `Godkjent ${clock}` : 'Godkjent';
}

/**
 * Hvem som får beskjed om godkjenningen: «Marte får beskjed om at kortet er
 * godkjent.», eller flertall for flere. Navnene er `notifiedNames` fra
 * `approveScreenState`, uten gjester. Tom liste gir `null`, og da står ingen
 * linje.
 */
export function notifiedLine(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const who = formatNameList(names);
  return names.length === 1
    ? `${who} får beskjed om at kortet er godkjent.`
    : `${who} får beskjed om at kortene deres er godkjent.`;
}

/**
 * Arket når kortet sendes tilbake. `name` er kortnavnet (kallenavn, ellers
 * fornavn). Et lagkort åpnes for hele laget. En gjest har ingen app-økt og får
 * ingen beskjed (beslutning 6), så teksten lover ikke det, og hjelpeteksten
 * under feltet faller bort (`hint: null`).
 */
export function rejectSheetText({
  name,
  teamCard,
  guest,
}: {
  name: string;
  teamCard: boolean;
  guest: boolean;
}): { title: string; body: string; hint: string | null } {
  const first = teamCard
    ? 'Lagkortet blir ulevert igjen for hele laget.'
    : 'Kortet blir ulevert igjen.';
  const second = guest
    ? 'Hullene kan rettes og kortet leveres på nytt.'
    : `${name} får beskjed og kan rette hullene og levere på nytt.`;
  return {
    title: `Send kortet tilbake til ${name}?`,
    body: `${first} ${second}`,
    hint: guest ? null : `${name} ser grunnen på spillsiden.`,
  };
}
