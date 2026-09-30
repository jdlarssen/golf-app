// #2255 PR 3a: når slagene ikke kom fra serveren (uten nett).
//
// «Hull for hull» og tavla henter slagene når skjermen åpnes, og tegner fra de
// lokale. Feiler hentingen, ser et kort med bare telefonens slag ferdig ut, så
// en linje sier det. Setningen finnes bare i appen og har ett hjem her.

export const SEED_FAILED_TEXT =
  'Fikk ikke hentet slagene fra serveren. Dette er det som ligger på telefonen.';
