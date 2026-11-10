// native/app/src/lib/paymentCopy.ts
// #2749: tekstene på kontingentkortet og premiebordet i venterommet.
//
// Hver streng er nettsidens ordrett, og `paymentCopy.test.ts` låser dem mot
// `messages/no.json` (`payment`, `prizes`, `wizard.sections.prizes`), så de to
// ikke glir fra hverandre.
import { formatKr } from '../../../../lib/format/formatKr';

export const PAYMENT_TEXT = {
  label: 'Startkontingent',
  payVia: 'Betal her',
  vippsTo: (number: string) => `Vipps til ${number}`,
  copy: 'Kopier',
  copied: 'Kopiert',
  arrangeWithHost: 'Avtal betaling med arrangøren.',
  paidBadge: 'Startkontingent betalt',
  amount: (kr: number) => formatKr(kr),
} as const;

export const PRIZE_TEXT = {
  boardTitle: 'Premiebord',
  placementLabel: (position: number) => `${position}. plass`,
  ldLabel: 'Lengste drive',
  ctpLabel: 'Nærmest pinnen',
  sponsoredBy: (sponsor: string) => `Sponset av ${sponsor}`,
  /** Nettets `wizard.sections.prizes.toggleCount`: «1 premie», «5 premier». */
  count: (n: number) => `${n} ${n === 1 ? 'premie' : 'premier'}`,
} as const;

/**
 * Veiviserens «Startkontingent» og «Premiebord» (#2749 PR B), nettets ord
 * (`wizard.sections.registration`, `wizard.sections.prizes`).
 */
export const WIZARD_FEE_TEXT = {
  paymentLegend: 'Startkontingent',
  paymentHint:
    'Valgfritt. Tar du en kontingent, ser spillerne beløpet og betalingsmåten når de melder seg på.',
  entryFeeLabel: 'Beløp per spiller (kr)',
  entryFeePlaceholder: '0',
  paymentLinkLabel: 'Vipps-nummer eller betalingslenke',
  paymentLinkPlaceholder: 'Vipps-nummer, f.eks. 12345',
  paymentLinkHint: 'Legg inn Vipps-nummeret ditt, eller lim inn en betalingslenke.',
  prizesLegend: 'Premiebord',
  toggleAdd: 'Legg til',
  toggleHide: 'Skjul',
  prizePlaceholder: 'Premie, f.eks. middag for to',
  sponsorLabel: 'Sponsor (valgfritt)',
  prizeAriaLabel: (slot: string) => `Premie for ${slot}`,
  sponsorAriaLabel: (slot: string) => `Sponsor (valgfritt) for ${slot}`,
} as const;

/**
 * Arrangørens Betaling-kort og «Hvem har betalt?» (#2749 PR C), nettets ord
 * (`admin.game.betaling`, `common.guestBadge`). `subline` og `loadFailed` finnes
 * bare i appen.
 */
export const BETALING_TEXT = {
  sectionLabel: 'Betaling',
  feeLabel: 'Startkontingent',
  paidLabel: 'Betalt',
  viewAll: 'Se betalingsstatus',
  kicker: 'Betaling',
  heading: 'Hvem har betalt?',
  rosterLabel: 'Spillere',
  unknownPlayer: 'Ukjent spiller',
  paid: 'Betalt',
  unpaid: 'Mangler',
  withdrawn: 'trukket',
  guest: 'Gjest',
  markPaidAria: (name: string) => `Marker ${name} som betalt`,
  toggleError: 'Kunne ikke lagre. Prøv igjen.',
  noFee: 'Dette spillet har ingen startkontingent.',
  remindButton: (count: number) => `Purr de som mangler (${count})`,
  remindDone: (count: number) => `Purret ${count} ${count === 1 ? 'spiller' : 'spillere'}.`,
  // --- Bare i appen ---
  /** Linja under tittelen: «Lørdagsrunden · 200 kr». */
  subline: (gameName: string, amountKr: number) => `${gameName} · ${formatKr(amountKr)}`,
  /** «(deg)» bak arrangørens eget navn, som i tegningen. */
  you: (name: string) => `${name} (deg)`,
  loadFailed: 'Fikk ikke hentet betalingene. Sjekk nettet og prøv igjen.',
  retry: 'Prøv igjen',
  remindFailed: 'Kunne ikke purre. Prøv igjen.',
} as const;
