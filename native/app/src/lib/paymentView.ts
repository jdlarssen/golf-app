// #2749: kontingentkortet og premiebordet i venterommet, som rene valg (Type A).
//
// Tolkningen av `payment_link` er nettets (`lib/payment/paymentLink.ts`): bare en
// `http(s)://`-lenke åpnes, alt annet er et Vipps-nummer som kopieres. Det er
// også vakta mot `javascript:` og `vipps://`. Rekkefølgen i premiebordet er
// nettets `PremiebordCard`: pallplassene først, så lengste drive, så nærmest
// pinnen.
import type { GamePrize } from '../../../../lib/games/prizes';
import { sideLabel } from '../../../../lib/games/sideLabel';
import { isPaymentUrl } from '../../../../lib/payment/paymentLink';
import { PRIZE_TEXT } from './paymentCopy';

export type PaymentView =
  | { kind: 'none' }
  | { kind: 'paid' }
  | { kind: 'link'; amountKr: number; url: string }
  | { kind: 'vipps'; amountKr: number; number: string }
  | { kind: 'arrange'; amountKr: number };

/**
 * Hvilken tilstand kortet har. Ingen kontingent gir ingen kort, også når
 * spilleren står som betalt; betalt slår lenka.
 */
export function paymentView({
  entryFeeKr,
  paymentLink,
  paidAt,
}: {
  entryFeeKr: number | undefined;
  paymentLink: string | null | undefined;
  paidAt: string | null | undefined;
}): PaymentView {
  if (!entryFeeKr || entryFeeKr <= 0) return { kind: 'none' };
  if (paidAt) return { kind: 'paid' };
  const link = paymentLink?.trim() || null;
  if (!link) return { kind: 'arrange', amountKr: entryFeeKr };
  return isPaymentUrl(link)
    ? { kind: 'link', amountKr: entryFeeKr, url: link }
    : { kind: 'vipps', amountKr: entryFeeKr, number: link };
}

export type PrizeRow = {
  key: string;
  /** «1. plass», «Lengste drive», «Nærmest pinnen 2». */
  label: string;
  description: string;
  /** «Sponset av …», eller `null` når slottet ikke har et sponsornavn. */
  sponsorLine: string | null;
  /** Medaljen foran pallplassene; sideturneringen har ingen. */
  medal: 1 | 2 | 3 | null;
};

const byPosition = (a: GamePrize, b: GamePrize) => a.position - b.position;

/** Linjene i det åpne premiebordet. Tom liste = ingen rad. */
export function prizeRows(prizes: readonly GamePrize[] | undefined): PrizeRow[] {
  const list = prizes ?? [];
  const placements = list.filter((p) => p.category === 'placement').sort(byPosition);
  const longestDrive = list.filter((p) => p.category === 'longest_drive').sort(byPosition);
  const closestToPin = list.filter((p) => p.category === 'closest_to_pin').sort(byPosition);
  const row = (prize: GamePrize, label: string, medal: PrizeRow['medal']): PrizeRow => ({
    key: `${prize.category}-${prize.position}`,
    label,
    description: prize.description,
    sponsorLine: prize.sponsor?.trim() ? PRIZE_TEXT.sponsoredBy(prize.sponsor.trim()) : null,
    medal,
  });
  return [
    ...placements.map((p) =>
      row(p, PRIZE_TEXT.placementLabel(p.position), p.position <= 3 ? (p.position as 1 | 2 | 3) : null),
    ),
    ...longestDrive.map((p) => row(p, sideLabel(PRIZE_TEXT.ldLabel, p.position, longestDrive.length), null)),
    ...closestToPin.map((p) => row(p, sideLabel(PRIZE_TEXT.ctpLabel, p.position, closestToPin.length), null)),
  ];
}
