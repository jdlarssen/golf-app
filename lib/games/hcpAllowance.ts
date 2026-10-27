import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * #2210 — which formats use the general `games.hcp_allowance_pct`.
 *
 * The rest carry their own percentage in `mode_config` (fourball, foursomes,
 * the scramble family, skins …) or play without one. For them the general
 * field is hidden in the form, but a value left over from an earlier format
 * choice (85 from best ball, 0 from «Brutto») used to be stored anyway and
 * applied at start — so fourball deducted its own percentage on top of 85,
 * and net skins became gross. The cup generator already pins the column to
 * 100 for these formats (`lib/cup/cupMatchAllowance.ts`).
 *
 * Exhaustive `Record<GameMode, boolean>`: a new format fails to compile here
 * until someone decides which side it is on.
 *
 * Pure file, no server imports: `gamePayload.ts` imports it, and the native
 * app bundles `gamePayload.ts` through Metro.
 */
const USES_GAME_HCP_ALLOWANCE: Record<GameMode, boolean> = {
  best_ball: true,
  stableford: true,
  modified_stableford: true,
  singles_matchplay: true,
  solo_strokeplay: true,
  texas_scramble: false,
  ambrose: false,
  florida_scramble: false,
  fourball_matchplay: false,
  foursomes_matchplay: false,
  greensome_matchplay: false,
  chapman_matchplay: false,
  wolf: false,
  nassau: false,
  skins: false,
  bingo_bango_bongo: false,
  nines: false,
  round_robin: false,
  acey_deucey: false,
  // #2570: covers champagne scramble too (a `shamble_variant`). Its field sits
  // under shamble's own «Tellemåte»; see `showsGeneralAllowanceField`.
  shamble: true,
  patsome: false,
  gruesome_matchplay: false,
};

/**
 * True when the format applies the general handicap percentage. Takes a
 * `string` because `game_mode` is read untyped in several places; an unknown
 * format answers `false`.
 */
export function usesGameHcpAllowance(mode: string): boolean {
  return (
    Object.hasOwn(USES_GAME_HCP_ALLOWANCE, mode) &&
    USES_GAME_HCP_ALLOWANCE[mode as GameMode]
  );
}

/**
 * The percentage to actually apply: the stored one for formats that use the
 * field, otherwise 100. Reading through this also corrects games already
 * stored with a stale value, without changing any data.
 */
export function effectiveHcpAllowancePct(
  mode: string,
  storedPct: number,
): number {
  return usesGameHcpAllowance(mode) ? storedPct : 100;
}

/**
 * #2660: the stroke cap to actually apply. It belongs to the general
 * percentage: a format with its own percentage in `mode_config` freezes the
 * full course handicap, and a cap there would cut the number its own
 * percentage is taken from. Only league flights set the column today, and all
 * three league formats use the general percentage.
 */
export function effectiveHcpMaxStrokes(
  mode: string,
  storedMaxStrokes: number | null,
): number | null {
  return usesGameHcpAllowance(mode) ? storedMaxStrokes : null;
}

/**
 * #2570: whether the general «Handicap-andel» card (Netto/Brutto + percent)
 * shows for the format. Shamble is the exception: its setup on step 2 already
 * has a drawn Netto/Brutto choice («Tellemåte»), so its percentage field sits
 * right under that instead, and a second Netto/Brutto switch would ask the
 * same thing twice. Field visibility only — the publish gate and the stored
 * value go through `hcpAllowanceInPlay`.
 */
export function showsGeneralAllowanceField(mode: string): boolean {
  return usesGameHcpAllowance(mode) && mode !== 'shamble';
}

/**
 * #2570: whether the percentage counts for this game. Same as
 * `usesGameHcpAllowance`, except gross shamble: it plays on raw strokes, the
 * percentage field is hidden, so its value is neither checked at publish nor
 * stored (the payload stores 100). Shamble's scoring lives in `mode_config`,
 * so the caller passes it; the other formats ignore it.
 */
export function hcpAllowanceInPlay(
  mode: string,
  shambleScoring: 'gross' | 'net' | undefined,
): boolean {
  if (mode === 'shamble' && shambleScoring === 'gross') return false;
  return usesGameHcpAllowance(mode);
}
