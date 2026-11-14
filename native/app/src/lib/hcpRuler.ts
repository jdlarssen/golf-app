// #2297: regnestykkene bak handicaplinjalen i arket på spillsiden.
//
// **Alt regnes i tideler.** 14,2 − 0,1 fire ganger i flyttall gir 13,799999…,
// og da sier knappen «Lagre 13,8» mens tallet som sendes er et annet. Hver
// funksjon her går via hele tideler og deler på 10 til slutt.
//
// Verdiene er SIGNERTE, som i basen: plusshandicap er negativt (+0,6 er −0,6).
// Linjalen går fra `rulerMin` (+8,0, eller lavere når spilleren har lagret mer)
// til `HCP_MAX` (54), og hvert tidels steg er `RULER_STEP` pt.
import { HCP_MAX, HCP_RULER_MIN, parseHcpMagnitude } from '../../../../lib/users/profileInput';

/** Avstanden mellom to merker på linjalen, i pt (tegningen `-linjal-`). */
export const RULER_STEP = 12;

/** Til hele tideler. `+ 0` gjør −0 om til 0, så «pluss 0» aldri vises. */
function toTenths(value: number): number {
  return Math.round(value * 10) + 0;
}

function fromTenths(tenths: number): number {
  return tenths / 10 + 0;
}

/**
 * Linjalens nedre ende for en spiller: +8,0, eller det lagrede tallet når det
 * er et større plusshandicap. Ingen kan dra seg forbi +8 fra et tall under.
 */
export function rulerMin(stored: number | null): number {
  return Math.min(HCP_RULER_MIN, stored ?? 0);
}

/** Antall tidels steg fra `min` til 54. Linjalen har ett merke mer enn dette. */
export function rulerSteps(min: number): number {
  return HCP_MAX * 10 - toTenths(min);
}

/** `signed` flyttet `deltaTenths` tideler, klemt til [min, 54]. */
export function stepHcp(signed: number, deltaTenths: number, min: number): number {
  const next = toTenths(signed) + deltaTenths;
  return fromTenths(Math.min(HCP_MAX * 10, Math.max(toTenths(min), next)));
}

/** Tallet under midtstreken når linjalen er rullet `x` pt. */
export function offsetToHcp(x: number, min: number): number {
  const index = Math.min(rulerSteps(min), Math.max(0, Math.round(x / RULER_STEP)));
  return fromTenths(toTenths(min) + index);
}

/** Hvor langt linjalen må rulles for at `value` står under midtstreken. */
export function hcpToOffset(value: number, min: number): number {
  return (toTenths(value) - toTenths(min)) * RULER_STEP;
}

export type HcpChange = { direction: 'up' | 'down' | 'none'; amount: number };

/** Endringen fra det lagrede tallet: pila og «0,4 fra sist». */
export function hcpChange(from: number, to: number): HcpChange {
  const diff = toTenths(to) - toTenths(from);
  return {
    direction: diff < 0 ? 'down' : diff > 0 ? 'up' : 'none',
    amount: fromTenths(Math.abs(diff)),
  };
}

/**
 * Det spilleren har skrevet i feltet, som signert tall, eller `null`.
 *
 * Et ledende «+» betyr plusshandicap. Resten leses av `parseHcpMagnitude`, så
 * både «13,8» og «13.8» virker, og formatet er det samme som profilskjemaet
 * godtar. Tallet rundes til én desimal (kolonnen er `numeric(4,1)`) og må ligge
 * på linjalen, i [min, 54].
 */
export function parseRulerField(raw: string, min: number): number | null {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+');
  const magnitude = parseHcpMagnitude(plus ? trimmed.slice(1).trim() : trimmed);
  if (magnitude === null) return null;
  const signed = fromTenths(toTenths(plus ? -magnitude : magnitude));
  if (signed < min || signed > HCP_MAX) return null;
  return signed;
}

/**
 * Hvorfor feltet ikke kan leses: et plusshandicap forbi linjalens ende, eller
 * noe annet. Bare meningsfull når {@link parseRulerField} ga `null`.
 */
export function rulerFieldProblem(raw: string, min: number): 'plus_beyond_min' | 'range' {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('+')) return 'range';
  const magnitude = parseHcpMagnitude(trimmed.slice(1).trim());
  return magnitude !== null && -magnitude < min ? 'plus_beyond_min' : 'range';
}
