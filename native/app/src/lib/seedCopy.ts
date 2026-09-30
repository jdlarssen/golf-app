// #2255 PR 3a: når slagene ikke kom fra serveren (uten nett).
//
// «Hull for hull» og tavla henter slagene når skjermen åpnes, og tegner fra de
// lokale. Feiler hentingen, ser et kort med bare telefonens slag ferdig ut, så
// en linje sier det. Setningen finnes bare i appen og har ett hjem her.

export const SEED_FAILED_TEXT =
  'Fikk ikke hentet slagene fra serveren. Dette er det som ligger på telefonen.';

/**
 * Wolf og BBB uten valgene (#2255 PR 3b): motoren kan ikke regne uten dem, så
 * skjermen sier fra i stedet for å vente. Første setning er felles for tavla
 * og «Hull for hull»; den andre sier hva som kommer.
 */
const CHOICES_MISSING = 'Fikk ikke tak i valgene som avgjør poengene.';
export const CHOICES_MISSING_BOARD_TEXT = `${CHOICES_MISSING} Tabellen kommer når nettet er tilbake.`;
export const CHOICES_MISSING_HOLES_TEXT = `${CHOICES_MISSING} Hull for hull kommer når nettet er tilbake.`;
