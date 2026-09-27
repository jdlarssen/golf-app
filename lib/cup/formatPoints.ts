import type { AppLocale } from '@/i18n/routing';
import { formatNumber } from '@/lib/i18n/format';

/**
 * Cup-poeng med locale-riktig desimalskille (#1488, K6; #2240): norsk «2,5»,
 * engelsk «2.5». Ett hjem for regelen som før lå som fire identiske lokale
 * kopier (cup-siden, resultatsiden, SideAwardsPanel, CupManagement). Rene
 * cup-poeng er halve tall (1, 0,5, 2,5) — ingen tusenskille. Holes-views/liga
 * har EGNE formatPoints med annen semantikk og røres ikke.
 */
export function formatPoints(n: number, locale: AppLocale): string {
  return formatNumber(n, locale, { useGrouping: false });
}
