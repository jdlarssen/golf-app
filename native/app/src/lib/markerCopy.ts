// #2661: tekstene for markøren i en simulatorliga. Ordlyden er webbens
// (`game.submit.marker`, `liga.marker`, `liga.player.markerQueue` i
// `messages/no.json`), og `markerCopy.test.ts` holder dem like tegn for tegn.
// Samme arbeidsdeling som de andre `*Copy.ts`: skjermen viser, teksten bor her.

export const MARKER_TEXT = {
  /** Velgeren over lever-knappen (`game.submit.marker`). */
  legend: 'Markør',
  hint: 'Velg hvem i ligaen som skal godkjenne kortet. Markøren får beskjed, og runden teller når kortet er godkjent.',
  none: 'Ingen andre i ligaen kan godkjenne kortet ennå. Be arrangøren legge til flere spillere.',
  unknownPlayer: 'Ukjent spiller',
  /** Søket i velgeren (#2675, `game.submit.marker`). */
  searchLabel: 'Søk etter markør',
  searchPlaceholder: 'Søk etter spiller',
  noMatch: 'Ingen spillere med det navnet.',
  showFewer: 'Vis færre',
  /** Markørens skjerm (`liga.marker`). */
  screenTitle: 'Markør',
  loading: 'Henter kortet …',
  /** Bare i appen: lesingen fra serveren feilet (eller kortet er ikke ditt). */
  loadFailed: 'Fikk ikke hentet kortet.',
  retry: 'Prøv igjen',
  intro: 'Se over slagene. Godkjenner du kortet, teller runden i tabellen. Stemmer noe ikke, sender du det tilbake med en kort grunn.',
  organizerNoMarker: 'Du godkjenner som arrangør.',
  /** Under kortet når det er godkjent (`liga.marker.state.approved`). */
  approved: 'Kortet er godkjent.',
  rejected: 'Kortet er sendt tilbake. Spilleren får beskjed med grunnen.',
  notDelivered: 'Kortet er ikke levert. Spilleren retter det og sender det inn igjen.',
  withdrawn: 'Spilleren har trukket seg fra runden.',
  closed: 'Runden er avsluttet.',
  /** Ligasiden (`liga.player.markerQueue`). */
  queueHeading: 'Venter på deg som markør',
  organizerQueueHeading: 'Venter på markøren',
  review: 'Se over',
} as const;

/** «Kortet til Anders» (`liga.marker.heading`). */
export function markerCardHeading(name: string | null): string {
  return `Kortet til ${name ?? MARKER_TEXT.unknownPlayer}`;
}

/** «Runde 3 i Vinterligaen» (`liga.marker.subtitle`). */
export function markerCardSubtitle(roundLabel: string, leagueName: string): string {
  return `${roundLabel} i ${leagueName}`;
}

/** «Du godkjenner som arrangør, i stedet for markøren (Mia).» (`liga.marker.organizerNote`). */
export function organizerNote(markerName: string | null): string {
  return markerName
    ? `Du godkjenner som arrangør, i stedet for markøren (${markerName}).`
    : MARKER_TEXT.organizerNoMarker;
}

/** «Venter på godkjenning fra Mia» (`liga.player.awaitingMarker`). */
export function awaitingMarkerLine(name: string): string {
  return `Venter på godkjenning fra ${name}`;
}

/** «venter på Mia» på arrangørens rad (`liga.player.markerQueue.waitsFor`). */
export function waitsForLine(name: string): string {
  return `venter på ${name}`;
}
