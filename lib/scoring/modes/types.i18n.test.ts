/**
 * Drift-guard: asserts that MODE_LABELS matches the modes namespace in
 * messages/no.json byte-for-byte, and that formatDisplayLabel output matches
 * the corresponding modeVariants catalog keys for all variant cases.
 *
 * MODE_LABELS stays in lib/ for unmigrated surfaces (admin, wizard). The
 * catalog keys are used by core-loop components that call t('modes.X').
 */
import { describe, it, expect } from 'vitest';
import { MODE_LABELS, PLAY_STYLE_LABELS, type GameMode } from './types';
import { formatDisplayLabel, formatDisplayLabelKey } from '@/lib/games/formatLabel';
import type { GameModeConfig } from './types';
import noMessages from '@/messages/no.json';

const MODES: GameMode[] = [
  'best_ball',
  'stableford',
  'modified_stableford',
  'singles_matchplay',
  'solo_strokeplay',
  'texas_scramble',
  'ambrose',
  'florida_scramble',
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'wolf',
  'nassau',
  'skins',
  'bingo_bango_bongo',
  'nines',
  'round_robin',
  'acey_deucey',
  'shamble',
  'patsome',
  'gruesome_matchplay',
];

// Resolve a dot-path into the modes catalog (handles modeVariants sub-namespace)
function resolveModesCatalogKey(key: string): string {
  const parts = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = noMessages.modes;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return key;
    node = node[part];
  }
  return typeof node === 'string' ? node : key;
}

describe('MODE_LABELS catalog drift-guard', () => {
  it.each(MODES)(
    'MODE_LABELS[%s] === no.json modes.%s',
    (mode) => {
      expect(MODE_LABELS[mode]).toBe(
        noMessages.modes[mode as keyof typeof noMessages.modes],
      );
    },
  );
});

// Representative (mode, config) pairs that exercise every distinct output
// branch of formatDisplayLabel.
const VARIANT_CASES: Array<{
  label: string;
  mode: GameMode;
  config: GameModeConfig;
  expectedLabel: string;
}> = [
  {
    label: 'Stableford team_size 2 → 4BBB Stableford',
    mode: 'stableford',
    config: { kind: 'stableford', team_size: 2, points_table: 'standard' },
    expectedLabel: '4BBB Stableford',
  },
  {
    label: 'Modified stableford team_size 2 → 4BBB Modifisert Stableford',
    mode: 'modified_stableford',
    config: {
      kind: 'modified_stableford',
      team_size: 2,
      points_table: 'modified',
    },
    expectedLabel: '4BBB Modifisert Stableford',
  },
  {
    label: 'Stableford team_size 1 → Stableford (falls back to MODE_LABELS)',
    mode: 'stableford',
    config: { kind: 'stableford', team_size: 1, points_table: 'standard' },
    expectedLabel: 'Stableford',
  },
  {
    label: "Shamble champagne variant → Champagne Scramble",
    mode: 'shamble',
    config: {
      kind: 'shamble',
      team_size: 4,
      teams_count: 2,
      shamble_variant: 'champagne',
      shamble_count: 2,
      shamble_scoring: 'net',
    },
    expectedLabel: 'Champagne Scramble',
  },
  {
    label: "Shamble shamble variant → Shamble",
    mode: 'shamble',
    config: {
      kind: 'shamble',
      team_size: 4,
      teams_count: 2,
      shamble_variant: 'shamble',
      shamble_count: 2,
      shamble_scoring: 'net',
    },
    expectedLabel: 'Shamble',
  },
  {
    label: 'solo_strokeplay → Slagspill (plain mode fallback)',
    mode: 'solo_strokeplay',
    config: { kind: 'solo_strokeplay', team_size: 1 },
    expectedLabel: 'Slagspill',
  },
];

describe('formatDisplayLabel + catalog drift-guard', () => {
  it.each(VARIANT_CASES)(
    '$label',
    ({ mode, config, expectedLabel }) => {
      // Runtime label matches expectation
      expect(formatDisplayLabel(mode, config)).toBe(expectedLabel);
      // Catalog key resolves to the same string
      const key = formatDisplayLabelKey(mode, config);
      expect(resolveModesCatalogKey(key)).toBe(expectedLabel);
    },
  );
});

// PLAY_STYLE_LABELS lost its last rendering consumer when FormatStyleBadge
// migrated to the modes.playStyle catalog keys (#561). The constant stays for
// exhaustiveness/type purposes; this guard keeps it in lockstep with the
// catalog until it can be removed outright.
describe('PLAY_STYLE_LABELS ↔ modes.playStyle drift-guard', () => {
  const playStyles = Object.keys(PLAY_STYLE_LABELS) as Array<
    keyof typeof PLAY_STYLE_LABELS
  >;

  it.each(playStyles)('%s matches catalog', (style) => {
    const catalog = (noMessages.modes as Record<string, unknown>).playStyle as Record<
      string,
      string
    >;
    expect(PLAY_STYLE_LABELS[style]).toBe(catalog[style]);
  });
});
