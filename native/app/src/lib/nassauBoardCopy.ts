// #2755: Nassau-tavlas norske tekster i appen, tegn for tegn fra webbens
// `leaderboard.nassau` (og `.board`) i `messages/no.json`.
//
// De rene strengene står som de er. ICU-strengene med `select` blir små
// funksjoner: `formatMessage` (kavalkadeCopy.ts) kan ikke `select`, og
// `intl-messageformat` lar seg ikke laste i appens jest. `nassauBoardCopy.test.ts`
// låser både de rene strengene og malene mot kilden, og hver gren mot teksten
// slik next-intl fyller den ut.
import type { NassauSectionKey } from '../../../../lib/leaderboard/nassauBoard';

/** `leaderboard.nassau.board` (de rene strengene) og overskriftene på kortene. */
export const NASSAU_BOARD_TEXT = {
  title: 'Tre kamper i én',
  subtitle: 'Front 9, back 9 og hele runden',
  stateDecided: 'Avgjort',
  stateWaiting: 'Ikke startet',
  tiedLead: 'Delt ledelse',
  pushed: 'Delt',
  noWinner: 'Ingen vinner',
  you: 'Deg',
  viewerLead: 'Du leder',
  viewerWon: 'Du vant',
  tapHint: 'Trykk på en kamp for å se hele lista',
  tablistLabel: 'Tre kamper',
  sweepSelf: 'Du kan ta alle tre.',
} as const;

/** `leaderboard.nassau`: kortenes kickere og tekstene i lista. */
export const NASSAU_TEXT = {
  front9Heading: 'Front 9',
  back9Heading: 'Back 9',
  totalLabel: 'Totalt',
  sectionTied: 'Delt 1.-plass',
  sectionsPending: 'Venter på spilte hull',
  sectionsPendingNote: 'Kampen er avgjort når alle har spilt hullene.',
} as const;

export const NASSAU_CARD_KICKER: Record<NassauSectionKey, string> = {
  front9: NASSAU_TEXT.front9Heading,
  back9: NASSAU_TEXT.back9Heading,
  total18: NASSAU_TEXT.totalLabel,
};

/**
 * Malene i kilden, brukt av testen. Funksjonene under fyller dem ut for hånd,
 * og testen krever at kilden ikke har flyttet seg.
 */
export const NASSAU_ICU_SOURCE = {
  stateLive: '{done} av {total} hull',
  viewerRank: 'Du: {tied, select, true {delt } other {}}{rank}.',
  viewerRankGap: 'Du: {tied, select, true {delt } other {}}{rank}. · {gap} bak',
  viewerLeadBy: 'Du leder med {lead}',
  viewerSr: 'Du er {tied, select, true {delt } other {}}nummer {rank}',
  viewerSrGap: 'Du er {tied, select, true {delt } other {}}nummer {rank}, {gap} slag bak',
  sweepOther: '{name} kan ta alle tre.',
  stopSweep:
    'Du kan stoppe det på {section, select, front9 {front 9} back9 {back 9} other {totalen}}.',
  panelHeading:
    '{section, select, front9 {Front 9 · hull 1–9} back9 {Back 9 · hull 10–18} other {Totalt · hull 1–18}}',
  listUnit: '{unit, select, toPar {mot par} gross {brutto slag} other {netto slag}}',
  rowHoles: '{holes} hull',
} as const;

/** Appens egen kicker: webbens `kicker` uten spillnavnet, som står som skjermtittel. */
export const NASSAU_KICKER_SOURCE = '{game} · Nassau · {scoring, select, gross {brutto} other {netto}}';

export const nassauBoardCopy = {
  stateLive: (done: number, total: number) => `${done} av ${total} hull`,
  viewerRank: (tied: boolean, rank: number) => `Du: ${tied ? 'delt ' : ''}${rank}.`,
  viewerRankGap: (tied: boolean, rank: number, gap: number) =>
    `Du: ${tied ? 'delt ' : ''}${rank}. · ${gap} bak`,
  viewerLeadBy: (lead: number) => `Du leder med ${lead}`,
  viewerSr: (tied: boolean, rank: number) => `Du er ${tied ? 'delt ' : ''}nummer ${rank}`,
  viewerSrGap: (tied: boolean, rank: number, gap: number) =>
    `Du er ${tied ? 'delt ' : ''}nummer ${rank}, ${gap} slag bak`,
  sweepOther: (name: string) => `${name} kan ta alle tre.`,
  stopSweep: (section: NassauSectionKey) =>
    `Du kan stoppe det på ${section === 'front9' ? 'front 9' : section === 'back9' ? 'back 9' : 'totalen'}.`,
  panelHeading: (section: NassauSectionKey) =>
    section === 'front9'
      ? 'Front 9 · hull 1–9'
      : section === 'back9'
        ? 'Back 9 · hull 10–18'
        : 'Totalt · hull 1–18',
  listUnit: (unit: 'toPar' | 'gross' | 'net') =>
    unit === 'toPar' ? 'mot par' : unit === 'gross' ? 'brutto slag' : 'netto slag',
  rowHoles: (holes: number) => `${holes} hull`,
  /** «Nassau · netto». Spillnavnet står som skjermtittel, så kickeren sier det ikke to ganger. */
  kicker: (scoring: 'gross' | 'net') => `Nassau · ${scoring === 'gross' ? 'brutto' : 'netto'}`,
};
