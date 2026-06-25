/**
 * Pengeoppgjør for veddemålsformatene (#937).
 *
 * Pott-modell («mot feltsnittet»): netto per spiller = (enheter − snitt) × kr.
 * Tilsvarer en lik delt pott der hver enhet (skin/poeng/seksjon) er verdt `kr`,
 * alle betaler likt inn, og du får `kr` per enhet du vinner. Summen er alltid 0.
 *
 * Format-agnostisk: tar kun en liste av { userId, units } fra motor-resultatet,
 * så den samme helperen dekker skins, wolf, nassau, bingo-bango-bongo,
 * acey-deucey og nines.
 */

export interface SettlementPlayerLine {
  userId: string;
  /** Enheter vunnet (skins/poeng/seksjoner) fra motor-resultatet. */
  units: number;
  /** Netto i hele kr; positiv = har til gode, negativ = skylder. Summen = 0. */
  netKr: number;
}

export interface SettlementPayment {
  /** Spilleren som skylder. */
  fromUserId: string;
  /** Spilleren som har til gode. */
  toUserId: string;
  /** Beløp i hele kr, alltid > 0. */
  kr: number;
}

export interface Settlement {
  krPerUnit: number;
  /** Enhets-label for UI: 'skin' | 'poeng' | 'seksjon'. */
  unitLabel: string;
  /** Per spiller, sortert på netKr synkende (vinner først). */
  perPlayer: SettlementPlayerLine[];
  /** Grådig min-transaksjons-oppgjør, ≤ N−1 betalinger. */
  payments: SettlementPayment[];
}

interface SettlementInput {
  units: { userId: string; units: number }[];
  krPerUnit: number;
  unitLabel: string;
}

/**
 * Beregner pengeoppgjøret. Returnerer null når funksjonen er av
 * (krPerUnit ≤ 0) eller det er for få spillere (< 2).
 */
export function computeSettlement(input: SettlementInput): Settlement | null {
  const { units, krPerUnit, unitLabel } = input;
  if (krPerUnit <= 0 || units.length < 2) return null;

  const n = units.length;
  const totalUnits = units.reduce((acc, u) => acc + u.units, 0);
  const mean = totalUnits / n;

  // Rå netto (eksakt) + avrunding til hele kr.
  const raw = units.map((u) => (u.units - mean) * krPerUnit);
  const rounded = raw.map((r) => Math.round(r));

  // Fordel avrundings-residual så summen blir nøyaktig 0 (largest-remainder).
  let residual = -rounded.reduce((acc, r) => acc + r, 0);
  if (residual !== 0) {
    const remainder = raw.map((r, i) => r - rounded[i]);
    const order = units
      .map((_, i) => i)
      .sort((a, b) => {
        // residual > 0: legg +1 der vi rundet mest NED (størst remainder), ellers største raw.
        // residual < 0: trekk −1 der vi rundet mest OPP (minst remainder), ellers minste raw.
        const cmp =
          residual > 0 ? remainder[b] - remainder[a] : remainder[a] - remainder[b];
        if (cmp !== 0) return cmp;
        return residual > 0 ? raw[b] - raw[a] : raw[a] - raw[b];
      });
    const step = residual > 0 ? 1 : -1;
    for (let k = 0; k < Math.abs(residual); k++) {
      rounded[order[k]] += step;
    }
    residual = 0;
  }

  const perPlayer: SettlementPlayerLine[] = units
    .map((u, i) => ({ userId: u.userId, units: u.units, netKr: rounded[i] }))
    .sort((a, b) => b.netKr - a.netKr || (a.userId < b.userId ? -1 : 1));

  return {
    krPerUnit,
    unitLabel,
    perPlayer,
    payments: buildPayments(perPlayer),
  };
}

/**
 * Grådig min-transaksjons-oppgjør: match største debitor mot største kreditor.
 * Produserer ≤ N−1 betalinger.
 */
function buildPayments(perPlayer: SettlementPlayerLine[]): SettlementPayment[] {
  const creditors = perPlayer
    .filter((p) => p.netKr > 0)
    .map((p) => ({ userId: p.userId, amount: p.netKr }))
    .sort((a, b) => b.amount - a.amount || (a.userId < b.userId ? -1 : 1));
  const debtors = perPlayer
    .filter((p) => p.netKr < 0)
    .map((p) => ({ userId: p.userId, amount: -p.netKr }))
    .sort((a, b) => b.amount - a.amount || (a.userId < b.userId ? -1 : 1));

  const payments: SettlementPayment[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const cred = creditors[ci];
    const deb = debtors[di];
    const pay = Math.min(cred.amount, deb.amount);
    if (pay > 0) {
      payments.push({ fromUserId: deb.userId, toUserId: cred.userId, kr: pay });
    }
    cred.amount -= pay;
    deb.amount -= pay;
    if (cred.amount === 0) ci++;
    if (deb.amount === 0) di++;
  }
  return payments;
}
