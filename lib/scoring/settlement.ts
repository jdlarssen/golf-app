/**
 * Pengeoppgjør for veddemålsformatene (#937).
 *
 * Pott-modell («mot feltsnittet»): netto per spiller = (enheter − snitt) × kr.
 * Tilsvarer en lik delt pott der hver enhet (skin/poeng/seksjon) er verdt `kr`,
 * alle betaler likt inn, og du får `kr` per enhet du vinner. Summen er alltid 0.
 *
 * `computeSettlement` er format-agnostisk: den tar kun en liste av
 * { userId, units }. Hvilke formater som gjør opp i penger, i hvilken enhet og
 * fra hvilket felt på motorens spillerrad, har ETT hjem her (#2221):
 * `SETTLEMENT_FORMATS` under. Nettsidens seks adaptere, begge opprett-veiviserne
 * og appens resultatskjerm leser den via `settlementUnitKeyFor` og
 * `settlementForResult`.
 *
 * Fila bundles også av appen (Metro): kun type-importer og relative stier.
 */
import type { ModeResult } from './modes/types';


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

/** Enheten et veddemålsformat gjør opp i. Oversettes av kalleren (`unitLabel`). */
export type SettlementUnitKey = 'skin' | 'poeng' | 'seksjon';

type SettlementKind =
  | 'skins'
  | 'wolf'
  | 'bingo_bango_bongo'
  | 'nines'
  | 'acey_deucey'
  | 'nassau';

type UnitLine = { userId: string; units: number };

/**
 * De seks formatene som spiller om penger: enheten, og feltet på motorens
 * spillerrad som teller enhetene. `result.kind` er lik modus-sluggen for alle
 * seks, så samme nøkkel slår opp både fra veiviseren (slug) og fra resultatet.
 */
const SETTLEMENT_FORMATS: {
  [K in SettlementKind]: {
    unit: SettlementUnitKey;
    units: (result: Extract<ModeResult, { kind: K }>) => UnitLine[];
  };
} = {
  skins: {
    unit: 'skin',
    units: (r) => r.players.map((p) => ({ userId: p.userId, units: p.totalSkins })),
  },
  wolf: {
    unit: 'poeng',
    units: (r) => r.players.map((p) => ({ userId: p.userId, units: p.totalPoints })),
  },
  bingo_bango_bongo: {
    unit: 'poeng',
    units: (r) => r.players.map((p) => ({ userId: p.userId, units: p.totalPoints })),
  },
  nines: {
    unit: 'poeng',
    units: (r) => r.players.map((p) => ({ userId: p.userId, units: p.totalPoints })),
  },
  // `total` = ace−deuce-summen, kan være negativ.
  acey_deucey: {
    unit: 'poeng',
    units: (r) => r.players.map((p) => ({ userId: p.userId, units: p.total })),
  },
  // `units` = antall seksjoner spilleren vant alene (0–3).
  nassau: {
    unit: 'seksjon',
    units: (r) => r.players.map((p) => ({ userId: p.userId, units: p.units })),
  },
};

function settlementFormat(mode: string) {
  // `hasOwnProperty`, ikke `in`: «toString» og venner er ikke formater.
  return Object.prototype.hasOwnProperty.call(SETTLEMENT_FORMATS, mode)
    ? SETTLEMENT_FORMATS[mode as SettlementKind]
    : null;
}

/** Enheten et format gjør opp i, eller null når formatet ikke spiller om penger. */
export function settlementUnitKeyFor(mode: string): SettlementUnitKey | null {
  return settlementFormat(mode)?.unit ?? null;
}

/**
 * `mode_config.kr_per_unit` lest defensivt: kolonnen er jsonb, og appen har
 * konfigurasjonen som `unknown`. Alt annet enn et endelig tall gir 0 (= av).
 */
function readKrPerUnit(modeConfig: unknown): number {
  if (typeof modeConfig !== 'object' || modeConfig === null) return 0;
  const kr = (modeConfig as { kr_per_unit?: unknown }).kr_per_unit;
  return typeof kr === 'number' && Number.isFinite(kr) ? kr : 0;
}

/**
 * Oppgjøret for et motorresultat: null når formatet ikke har oppgjør,
 * `kr_per_unit` mangler/≤ 0, eller det er færre enn 2 spillere.
 */
export function settlementForResult(
  result: ModeResult,
  modeConfig: unknown,
  unitLabel: (unit: SettlementUnitKey) => string,
): Settlement | null {
  const format = settlementFormat(result.kind);
  if (!format) return null;
  // TS kan ikke koble tabell-nøkkelen til resultat-varianten; oppslaget over
  // gikk på `result.kind`, så varianten stemmer.
  const units = (format.units as (r: ModeResult) => UnitLine[])(result);
  return computeSettlement({
    units,
    krPerUnit: readKrPerUnit(modeConfig),
    unitLabel: unitLabel(format.unit),
  });
}
