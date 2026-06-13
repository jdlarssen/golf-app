// Variant-bevisst flate-navn for et spill. Holdt som ren modul (INGEN
// 'use client', ingen Supabase-import) slik at den kan importeres fritt fra
// både server-components og client-components uten throw-function-wrapping.
//
// Bakgrunn (#282): standard Stableford med team_size 2 ER 4BBB / better-ball
// (beste poeng per hull teller). MODE_LABELS[mode] gir bare «Stableford» og
// kjenner ikke variant-skillet siden begge varianter deler game_mode
// 'stableford'. Denne helperen leser mode_config.team_size og gir et navngitt,
// gjenkjennelig flate-navn der vi har config tilgjengelig.

import {
  MODE_LABELS,
  isStablefordFamily,
  type GameMode,
  type GameModeConfig,
} from '@/lib/scoring/modes/types';

/**
 * Flate-navn for et spill, variant-bevisst.
 *
 *  - Standard Stableford, team_size 2  → «4BBB Stableford»
 *  - Modifisert Stableford, team_size 2 → «4BBB Modifisert Stableford»
 *  - Shamble, variant 'champagne'        → «Champagne Scramble»
 *  - Shamble, variant 'shamble'          → «Shamble»
 *  - Alt annet (inkl. solo-stableford)  → MODE_LABELS[mode]
 *
 * Defensivt: narrower på både `mode` (familie) og `mode_config.kind` +
 * `team_size`, og faller tilbake til MODE_LABELS for legacy/ukjent config.
 */
export function formatDisplayLabel(
  mode: GameMode,
  modeConfig: GameModeConfig,
): string {
  // Shamble/Champagne deler én umbrella-GameMode; variant gir konkret navn.
  if (mode === 'shamble' && modeConfig.kind === 'shamble') {
    return modeConfig.shamble_variant === 'champagne'
      ? 'Champagne Scramble'
      : 'Shamble';
  }
  if (
    isStablefordFamily(mode) &&
    (modeConfig.kind === 'stableford' ||
      modeConfig.kind === 'modified_stableford') &&
    modeConfig.team_size === 2
  ) {
    return mode === 'modified_stableford'
      ? '4BBB Modifisert Stableford'
      : '4BBB Stableford';
  }
  return MODE_LABELS[mode];
}

/**
 * Returns the catalog key path (under the `modes` namespace) that corresponds
 * to the display label for the given mode/config combination.
 *
 * Used by core-loop components that translate via `t()` instead of reading
 * the Norwegian constant directly, and by drift-guard tests that assert the
 * catalog key resolves to the same string as `formatDisplayLabel`.
 *
 *  - Stableford team_size 2        → 'modeVariants.stableford_team'
 *  - Modified stableford team_size 2 → 'modeVariants.modified_stableford_team'
 *  - Shamble champagne variant     → 'modeVariants.shamble_champagne'
 *  - Shamble shamble variant       → 'modeVariants.shamble_shamble'
 *  - All other modes               → the mode code itself (e.g. 'solo_strokeplay')
 */
export function formatDisplayLabelKey(
  mode: GameMode,
  modeConfig: GameModeConfig,
): string {
  if (mode === 'shamble' && modeConfig.kind === 'shamble') {
    return modeConfig.shamble_variant === 'champagne'
      ? 'modeVariants.shamble_champagne'
      : 'modeVariants.shamble_shamble';
  }
  if (
    isStablefordFamily(mode) &&
    (modeConfig.kind === 'stableford' ||
      modeConfig.kind === 'modified_stableford') &&
    modeConfig.team_size === 2
  ) {
    return mode === 'modified_stableford'
      ? 'modeVariants.modified_stableford_team'
      : 'modeVariants.stableford_team';
  }
  return mode;
}

/**
 * Returns the `formatGuide.content.<key>` catalog key for a mode + team size.
 *
 * Mirrors the (now removed) `resolveModeGuide`: the whole stableford family
 * with team_size 2 maps to the dedicated 4BBB variant content entry
 * (`stableford-4bbb`), everything else uses the mode code itself. Used by the
 * format guide, the detail page and the game-home mode card to read the right
 * summary/points from the message catalog (i18n Fase D, #592).
 */
export function resolveFormatContentKey(
  mode: GameMode,
  teamSize: number,
): string {
  if (isStablefordFamily(mode) && teamSize === 2) return 'stableford-4bbb';
  return mode;
}
