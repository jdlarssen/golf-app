/**
 * Drift-guard: ERROR_MESSAGES_NEW_GAME is dual-sourced since #561 — the
 * new-game pages (admin/games/new + opprett-spill) render wizard.errors.*
 * from the catalog, while the 2c-pending pages (admin/games/[id]/edit and
 * games/[id]/rediger) still read this map. The map dies when 2c migrates
 * those pages; until then this test keeps the two sources byte-identical.
 *
 * Placeholder note: the legacy map uses `{LIST}` (custom replace in
 * buildGameErrorMessage); the catalog uses ICU `{list}`. The guard
 * normalizes that one token before comparing.
 */
import { describe, it, expect } from 'vitest';
import { ERROR_MESSAGES_NEW_GAME } from './gameErrorMessages';
import noMessages from '@/messages/no.json';

const catalogErrors = (noMessages.wizard as { errors: Record<string, string> })
  .errors;

describe('ERROR_MESSAGES_NEW_GAME ↔ wizard.errors drift-guard', () => {
  const codes = Object.keys(ERROR_MESSAGES_NEW_GAME);

  it.each(codes)('%s matches catalog', (code) => {
    const legacy = ERROR_MESSAGES_NEW_GAME[code].replace('{LIST}', '{list}');
    expect(catalogErrors[code]).toBe(legacy);
  });
});
