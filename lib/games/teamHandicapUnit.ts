// Lag-handicap-enheten arrangøren ser, mot den appen lagrer (#2009).
//
// Motoren (`computeScramble`) regner lag-handicapet som en prosent av SUMMEN
// av spillernes banehandicap. Det tallet bor i `mode_config.team_handicap_pct`
// og rører vi ikke — hele scramble-familien scorer på det, og eldre spill har
// det lagret. Arrangører tenker derimot i prosent av lagets SNITT («ta snittet
// og kjør 80 %»). Forskjellen er bare lagstørrelsen: snitt = sum ÷ N, så
//
//   prosent av sum = prosent av snitt ÷ N
//
// Veiviseren viser og tar imot snitt-prosenten. Disse to funksjonene er
// oversettelsen begge veier, og de bor her — ikke i komponenten — så
// redigeringsflyten og en eventuell visning på spillsiden regner likt.
//
// Rundingen er valgt så et heltall arrangøren taster overlever tur–retur for
// alle lagstørrelser opp til fire: lagret verdi får to desimaler (feil ≤ 0,005,
// ganget med 4 gir 0,02 — godt under den halve som ville vippet avrundingen).
// `teamHandicapUnit.test.ts` låser det for hvert heltall 0–100.

/**
 * Arrangørens tall (prosent av lagets snitt-handicap) → lagret tall (prosent av
 * summen). To desimaler. 0 er brutto i begge enheter.
 */
export function averagePctToSumPct(averagePct: number, teamSize: number): number {
  if (!Number.isFinite(averagePct) || !(teamSize > 0)) return 0;
  return Math.round((averagePct / teamSize) * 100) / 100;
}

/**
 * Lagret tall (prosent av summen) → arrangørens tall (prosent av snittet).
 * Heltall, siden det er det feltet i veiviseren tar imot.
 */
export function sumPctToAveragePct(sumPct: number, teamSize: number): number {
  if (!Number.isFinite(sumPct) || !(teamSize > 0)) return 0;
  return Math.round(sumPct * teamSize);
}
