import { describe, it, expect } from 'vitest';
import { STRUCTURAL_BLOCK_REASONS } from './startBlockReasons';
import { startErrorMessageArgs } from './startErrorMessage';
import no from '@/messages/no.json';
import en from '@/messages/en.json';

// #502 / #2204 / #2569: a structural reason is one the organiser has to fix,
// so the «auto-start blokkert» card (`blockReasonText`, inbox.blockReasons)
// and the organiser's notice on the game page (`admin.game.errors`, via
// `startErrorMessageArgs`) must both have words for it. A reason without them
// falls back to the generic line, which says nothing about what to fix.
describe('every structural start block has its own words, in both locales', () => {
  const catalogs = [
    ['no', no],
    ['en', en],
  ] as const;

  it.each(catalogs)('%s', (_locale, messages) => {
    const inbox: Record<string, string> = messages.inbox.blockReasons;
    const errors: Record<string, string> = messages.admin.game.errors;
    expect(STRUCTURAL_BLOCK_REASONS.size).toBeGreaterThan(0);
    for (const reason of STRUCTURAL_BLOCK_REASONS) {
      expect(inbox[reason], `inbox.blockReasons.${reason}`).toBeTruthy();
      // rotation_player_count has one sentence per format; Wolf stands in.
      const { key } = startErrorMessageArgs({ code: reason, mode: 'wolf', count: 2 });
      expect(errors[key], `admin.game.errors.${key}`).toBeTruthy();
    }
  });

  it('uneven_teams is structural (#2569)', () => {
    expect(STRUCTURAL_BLOCK_REASONS.has('uneven_teams')).toBe(true);
  });
});
