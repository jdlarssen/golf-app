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
