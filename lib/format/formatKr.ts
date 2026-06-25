/**
 * Formaterer et kronebeløp på norsk: mellomrom som tusenskille, `kr`-suffiks,
 * ekte minus-tegn (−, U+2212) for negative beløp. Avrunder til hele kr.
 *
 * formatKr(200)     → "200 kr"
 * formatKr(1400)    → "1 400 kr"
 * formatKr(-67)     → "−67 kr"
 * formatKr(0)       → "0 kr"
 */
export function formatKr(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '−' : '';
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped} kr`;
}
