/**
 * Cup-poeng med norsk desimalkomma (#1488, K6). Ett hjem for regelen som før lå
 * som fire identiske lokale kopier (cup-siden, resultatsiden, SideAwardsPanel,
 * CupManagement). Rene cup-poeng er halve tall (1, 0,5, 2,5) — bare punktum →
 * komma, ingen tusenskille. Holes-views/liga har EGNE formatPoints med annen
 * semantikk og røres ikke.
 */
export function formatPoints(n: number): string {
  return String(n).replace('.', ',');
}
