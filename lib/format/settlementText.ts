/**
 * The settlement as plain text for the group chat (#2296): what «Kopier til
 * gruppechatten» puts on the clipboard.
 *
 *   Oppgjør: Lørdagsrunden (Skins)
 *   20 kr per skin · 4 spillere
 *
 *   Jonas betaler Marte 40 kr
 *   Anders betaler Kristian 20 kr
 *
 *   Sluttsum:
 *   Marte +40 kr
 *   …
 *
 * No emoji and no link: a finished game is not open to everyone (#1542).
 * The caller fills in the translated labels, so the file needs no next-intl
 * and no server code — the app (Metro) can bundle it the day kroner are shown
 * there. Relative imports only, for the same reason.
 */
import { formatKr } from './formatKr';
import type { Settlement } from '../scoring/settlement';

export interface SettlementTextLabels {
  /** «Oppgjør: Lørdagsrunden (Skins)», filled in by the caller. */
  heading: string;
  /** «20 kr per skin · 4 spillere», filled in by the caller. */
  stake: string;
  /** «Jonas betaler Marte 40 kr». */
  payment: (from: string, to: string, amount: string) => string;
  /** «Sluttsum:». */
  totalsHeading: string;
}

export function buildSettlementText(
  settlement: Settlement,
  nameOf: (userId: string) => string,
  labels: SettlementTextLabels,
): string {
  const payments = settlement.payments.map((p) =>
    labels.payment(nameOf(p.fromUserId), nameOf(p.toUserId), formatKr(p.kr)),
  );
  // The engine's order (winner first); formatKr gives the real minus sign.
  const totals = settlement.perPlayer.map(
    (p) => `${nameOf(p.userId)} ${p.netKr > 0 ? '+' : ''}${formatKr(p.netKr)}`,
  );
  return [
    labels.heading,
    labels.stake,
    '',
    ...payments,
    '',
    labels.totalsHeading,
    ...totals,
  ].join('\n');
}
