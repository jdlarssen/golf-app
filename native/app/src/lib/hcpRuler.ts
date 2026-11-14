// #2297: regnestykket bak handicap-linjalen i arket «Oppdater handicap».
//
// Alt regnes i tideler (heltall) og deles på 10 til slutt, så 14,2 − 4 × 0,1 er
// nøyaktig 13,8 og aldri 13,799999. Verdiene er SIGNERTE som i basen: plusshandicap
// er negativt (`lib/handicap/sign.ts`), og linja går fra −8 (+8) til 54.
import { toSignedHcp } from '../../../../lib/handicap/sign';
import {
  HCP_MAX,
  HCP_RULER_MIN,
  parseHcpMagnitude,
} from '../../../../lib/users/profileInput';

/** Punkter mellom to streker på linjalen: 12 pt per 0,1. */
export const RULER_TICK_PT = 12;

const tenths = (value: number): number => Math.round(value * 10);

/**
 * Nederste stopp på linjalen for en spiller med lagret handicap `stored`: −8, men
 * aldri over det som står. Har spilleren mer enn +8 fra før, stopper linjalen på
 * den lagrede verdien, så ingen er låst ute av sitt eget tall.
 */
export function rulerMin(stored: number): number {
  return Math.min(HCP_RULER_MIN, tenths(stored) / 10);
}

/** Ett trinn på linja (`deltaTenths` tideler), klemt til [min, 54]. */
export function stepHcp(signed: number, deltaTenths: number, min: number): number {
  const next = tenths(signed) + deltaTenths;
  return Math.min(Math.max(next, tenths(min)), HCP_MAX * 10) / 10;
}

/** Scroll-posisjonen (punkter fra venstre kant av innholdet) → handicap. */
export function offsetToHcp(x: number, min: number): number {
  const steps = Math.round(x / RULER_TICK_PT);
  return Math.min(Math.max(tenths(min) + steps, tenths(min)), HCP_MAX * 10) / 10;
}

/** Handicap → scroll-posisjon. Det omvendte av {@link offsetToHcp}. */
export function hcpToOffset(value: number, min: number): number {
  return (tenths(value) - tenths(min)) * RULER_TICK_PT;
}

/** Antall tideler fra nederste til øverste stopp: linjalens lengde i trinn. */
export function rulerSteps(min: number): number {
  return HCP_MAX * 10 - tenths(min);
}

export interface HcpChange {
  /** `down` = lavere handicap (bedre), `up` = høyere. */
  direction: 'up' | 'down' | 'none';
  /** Størrelsen, alltid ≥ 0 og i én desimal. */
  amount: number;
}

export function hcpChange(from: number, to: number): HcpChange {
  const diff = tenths(to) - tenths(from);
  if (diff === 0) return { direction: 'none', amount: 0 };
  return { direction: diff < 0 ? 'down' : 'up', amount: Math.abs(diff) / 10 };
}

/**
 * Det spilleren skrev i feltet «Skriv inn tallet», eller `null` når det ikke er
 * et gyldig handicap. Et ledende «+» betyr plusshandicap; resten går gjennom
 * `parseHcpMagnitude` (komma og punktum, ingen bokstaver). Tallet rundes til én
 * desimal, som kolonnen, og må ligge i [`min`, 54].
 */
export function parseRulerField(raw: string, min: number): number | null {
  const text = raw.trim();
  const plus = text.startsWith('+');
  const magnitude = parseHcpMagnitude(plus ? text.slice(1).trim() : text);
  if (magnitude === null) return null;
  const signed = toSignedHcp(Math.round(magnitude * 10) / 10, plus);
  if (tenths(signed) < tenths(min) || tenths(signed) > HCP_MAX * 10) return null;
  return signed;
}

/**
 * Er feltet et plusshandicap som bare er for stort (`+9,5` med −8 som stopp)?
 * Da sier linja under feltet hvor langt plusshandicap kan gå, i stedet for
 * «mellom 0 og 54».
 */
export function isPlusOverLimit(raw: string, min: number): boolean {
  const text = raw.trim();
  if (!text.startsWith('+')) return false;
  const magnitude = parseHcpMagnitude(text.slice(1).trim());
  return magnitude !== null && -Math.round(magnitude * 10) < tenths(min);
}
