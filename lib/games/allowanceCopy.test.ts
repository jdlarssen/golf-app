/**
 * Regression guard for #927: bruttoHelperKeyFor must return a key that
 * resolves under the `allowance` translation scope.
 *
 * The call-sites (GameForm.tsx, GameWizard.tsx) translate with
 * `tAllowance = useTranslations('allowance')`, so the effective lookup is
 * `allowance.<bruttoHelperKeyFor(mode)>`. If the function returns a key that
 * already carries the `allowance.` prefix, next-intl resolves the doubled
 * path `allowance.allowance.bruttoHelper.<mode>` → MISSING_MESSAGE (renders
 * the raw mode slug as helper text in prod). This test mirrors that scoped
 * resolution against the real catalog for every GameMode, so the regression
 * cannot return.
 */
import { describe, it, expect } from 'vitest';
import { bruttoHelperKeyFor } from './allowanceCopy';
import { MODE_LABELS, type GameMode } from '@/lib/scoring/modes/types';
import noMessages from '@/messages/no.json';

const MODES = Object.keys(MODE_LABELS) as GameMode[];

// Walk a dot-path starting from the `allowance`-scoped catalog node, exactly
// as next-intl would when the key is passed to useTranslations('allowance').
function resolveUnderAllowanceScope(key: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = noMessages.allowance;
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

describe('bruttoHelperKeyFor — #927 scoped-resolution guard', () => {
  it.each(MODES)(
    'bruttoHelperKeyFor(%s) resolves to a non-empty string under the allowance scope',
    (mode) => {
      const key = bruttoHelperKeyFor(mode);
      const resolved = resolveUnderAllowanceScope(key);
      expect(typeof resolved).toBe('string');
      expect(resolved as string).not.toHaveLength(0);
    },
  );

  it.each(MODES)(
    'bruttoHelperKeyFor(%s) returns a key relative to the allowance scope (no doubled prefix)',
    (mode) => {
      expect(bruttoHelperKeyFor(mode).startsWith('allowance.')).toBe(false);
    },
  );
});
