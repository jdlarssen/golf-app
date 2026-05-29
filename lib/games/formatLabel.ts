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
 *  - Alt annet (inkl. solo-stableford)  → MODE_LABELS[mode]
 *
 * Defensivt: narrower på både `mode` (familie) og `mode_config.kind` +
 * `team_size`, og faller tilbake til MODE_LABELS for legacy/ukjent config.
 */
export function formatDisplayLabel(
  mode: GameMode,
  modeConfig: GameModeConfig,
): string {
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
