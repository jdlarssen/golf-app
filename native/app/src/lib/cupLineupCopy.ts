// #2752: ordene i uttaket. De er nettets (`cup.lineup.*`, `cup.participants.*`,
// `cup.public.*`), låst i `cupLineupCopy.test.ts`, og står her fordi appen ikke leser
// nettets katalog.
import { setupLoadFailureText } from './cupSetupCopy';

export const LINEUP_TEXT = {
  pageTitle: 'Uttak',
  unknownPlayer: 'Ukjent spiller',
  subtitleOrganizer: 'Åpne øktene og følg med på hvem som har levert.',
  subtitleCaptain: 'Sett laget ditt. Motstanderen ser ingenting før begge har levert.',
  needsCaptains: 'Begge lag trenger en kaptein før du kan åpne en økt. Det gjør du i Spillere-rommet.',
  plannedHeading: 'Planlagt antall kamper',
  plannedHelper:
    'Tell alle kampene i hele cupen, også dem som alt er satt opp. Poengmålet følger dette tallet, så alle vet hva som skal til fra første slag. Blir det flere kamper enn planlagt, følger målet etter.',
  plannedLabel: 'Kamper i alt',
  plannedSave: 'Lagre',
  plannedTarget: '{count, plural, one {# kamp} other {# kamper}} gir et poengmål på {points}',
  plannedCurrent: 'Målet nå: først til {points} poeng',
  needsPlanned: 'Si hvor mange kamper cupen skal ha før du åpner den første økten.',
  openHeading: 'Åpne en økt',
  openHelper: 'Velg format og hvor mange kamper økten skal ha. Kapteinene fyller resten.',
  formatLabel: 'Format',
  slotCountLabel: 'Antall kamper',
  decrease: 'Én kamp færre',
  increase: 'Én kamp til',
  openButton: 'Åpne økten',
  squadTooSmall: 'Lagene er for små til dette formatet. Fordel flere spillere først.',
  sessionsHeading: 'Økter',
  emptyOrganizer: 'Du har ikke åpnet noen økt ennå.',
  emptyCaptain: 'Arrangøren har ikke åpnet noen økt ennå.',
  slotSummary: '{count, plural, one {# kamp} other {# kamper}}',
  revealed: 'Avdekket',
  waiting: 'Venter',
  submitted: 'Levert',
  notSubmitted: 'Ikke levert',
  hidden: 'Skjult til begge lag har levert.',
  hiddenBothSubmitted: 'Begge lag har levert. Kampene er ikke satt opp ennå.',
  unlock: 'Lås opp',
  deleteSession: 'Slett økten',
  retryHeading: 'Begge lag har levert, men kampene mangler',
  retryHelper: 'Prøver du igjen, står uttakene akkurat som kapteinene leverte dem.',
  retryButton: 'Prøv igjen',
  seatLabel: 'Kamp {slot}, spiller {seat}',
  pickPlayer: 'Velg spiller',
  submitButton: 'Lever uttaket',
  fillAllSlots: 'Fyll alle plassene før du leverer.',
} as const;

/** Rollene på spillerlista (`cup.participants.*`). */
export const ROLE_TEXT = {
  roleHelper: 'Sett spillerne på lag og pek ut én kaptein per lag. Da gjør kapteinene uttaket selv, økt for økt.',
  captainLabel: 'Kaptein',
  captainBadge: 'Kaptein',
  saveRole: 'Lagre',
  teamSelect: 'Lag for {name}',
  captain: '{name} er kaptein',
  saveRoleLabel: 'Lagre lag og kaptein for {name}',
  unassigned: '—',
} as const;

/** Dørene og kortet i cup-rommet (`cup.manage.doors.*`, `cup.public.*`). */
export const LINEUP_ROOM_TEXT = {
  organizerDoor: 'Uttak',
  organizerDoorSub: '{count, plural, =0 {Ingen økter åpnet} one {# økt} other {# økter}}',
  captainDoor: 'Uttaket',
  captainDoorSub: 'Sett laget for neste økt',
  revealedTitle: 'Kampene er klare',
  revealedBody: 'Kapteinene har levert. {format}: {count, plural, one {# kamp} other {# kamper}} er satt opp.',
} as const;

const LINEUP_ERRORS: Record<string, string> = {
  not_allowed: 'Du har ikke tilgang til dette uttaket.',
  not_found: 'Fant ikke cupen eller økta.',
  save_failed: 'Klarte ikke å lagre. Prøv igjen.',
  lineup_incomplete: 'Du må fylle alle plassene før du kan levere.',
  lineup_duplicate_player: 'Samme spiller står på to plasser. Én plass per spiller i hver økt.',
  lineup_not_in_squad: 'En av spillerne er ikke på laget ditt.',
  lineup_slot_shape: 'Uttaket ser rart ut. Last siden på nytt og prøv igjen.',
  lineup_squad_too_small: 'Laget har for få spillere til denne økten.',
  lineup_squad_changed: 'Lagene er endret etter at uttaket ble levert. Lås opp uttaket og be kapteinen velge på nytt.',
  lineup_revealed: 'Økten er allerede avdekket.',
  lineup_not_both_submitted: 'Begge lag må ha levert før kampene kan settes opp.',
  lineup_already_submitted: 'Uttaket er levert. Be arrangøren låse det opp hvis du vil endre noe.',
  lineup_format: 'Ukjent format.',
  lineup_slot_count: 'Antall kamper passer ikke med lagstørrelsen.',
  too_many_matches: 'Cupen har ikke plass til flere kamper.',
  lineup_planned_total: 'Skriv et helt tall som minst dekker kampene du alt har satt opp eller åpnet økt for.',
  lineup_planned_total_missing: 'Si hvor mange kamper cupen skal ha først.',
  planned_saved_target_failed: 'Tallet er lagret, men poengmålet henger etter. Lagre en gang til, så retter det seg.',
  cup_finished: 'Cupen er avsluttet.',
  missing_plan: 'Bane og tee mangler. Fyll ut Oppsett-rommet først.',
  plan_tee: 'Teen fra oppsettet finnes ikke lenger. Velg en ny i Oppsett-rommet.',
  insert_failed: 'Klarte ikke å sette opp kampene. Prøv igjen.',
  profile_read_failed: 'Klarte ikke å hente spillerne. Prøv igjen.',
  invalid_source_match: 'Uttaket ser rart ut. Last siden på nytt og prøv igjen.',
  rollback_failed:
    'Noen av kampene ble satt opp før det gikk galt, og de ble ikke fjernet igjen. Ta kontakt med administrator for å få ryddet økten.',
  reveal_undo_failed: 'Kampene ble ikke satt opp, men økten står likevel som avdekket. Ta kontakt med administrator for å få ryddet den.',
};

/** Nettets setning for koden. Uten nett og uten innlogging sier det samme som resten av cupen. */
export function lineupFailureText(reason: string): string {
  if (LINEUP_ERRORS[reason]) return LINEUP_ERRORS[reason];
  const app = setupLoadFailureText(reason);
  return app === setupLoadFailureText('load_failed') ? LINEUP_ERRORS.save_failed : app;
}

/** Når tavla ikke kunne leses. */
export function lineupLoadFailureText(reason: string): string {
  return reason === 'not_allowed' || reason === 'not_found' ? LINEUP_ERRORS[reason] : setupLoadFailureText(reason);
}
