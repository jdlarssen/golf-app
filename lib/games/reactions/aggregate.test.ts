import { describe, it, expect } from 'vitest';
import { aggregateReactions, type ReactionRow } from './aggregate';

const ME = 'user-me';
const OTHER = 'user-other';
const TARGET_A = 'target-a';
const TARGET_B = 'target-b';

function row(
  target_user_id: string,
  emoji: string,
  user_id: string,
): ReactionRow {
  return { target_user_id, emoji, user_id };
}

describe('aggregateReactions', () => {
  it('returns empty object for empty input', () => {
    expect(aggregateReactions([], ME)).toEqual({});
  });

  it('counts a single reaction', () => {
    const result = aggregateReactions([row(TARGET_A, '👏', OTHER)], ME);
    expect(result[TARGET_A].counts['👏']).toBe(1);
    expect(result[TARGET_A].mine).toEqual([]);
  });

  it('counts multiple users giving the same emoji on the same target', () => {
    const rows = [
      row(TARGET_A, '🔥', 'u1'),
      row(TARGET_A, '🔥', 'u2'),
      row(TARGET_A, '🔥', 'u3'),
    ];
    const result = aggregateReactions(rows, ME);
    expect(result[TARGET_A].counts['🔥']).toBe(3);
  });

  it('counts different emojis from the same user on the same target separately', () => {
    const rows = [
      row(TARGET_A, '👏', ME),
      row(TARGET_A, '🔥', ME),
    ];
    const result = aggregateReactions(rows, ME);
    expect(result[TARGET_A].counts['👏']).toBe(1);
    expect(result[TARGET_A].counts['🔥']).toBe(1);
  });

  it('populates mine when viewer has given a reaction', () => {
    const rows = [
      row(TARGET_A, '💪', ME),
      row(TARGET_A, '💪', OTHER),
    ];
    const result = aggregateReactions(rows, ME);
    expect(result[TARGET_A].mine).toContain('💪');
    expect(result[TARGET_A].counts['💪']).toBe(2);
  });

  it('mine does not include emojis given by other users', () => {
    const rows = [row(TARGET_A, '😂', OTHER)];
    const result = aggregateReactions(rows, ME);
    expect(result[TARGET_A].mine).toEqual([]);
    expect(result[TARGET_A].counts['😂']).toBe(1);
  });

  it('mine is sorted by palette order regardless of input order', () => {
    // Give me 🐦 then 👏 — palette has 👏 first
    const rows = [
      row(TARGET_A, '🐦', ME),
      row(TARGET_A, '👏', ME),
    ];
    const result = aggregateReactions(rows, ME);
    expect(result[TARGET_A].mine).toEqual(['👏', '🐦']);
  });

  it('silently ignores rows with emojis not in the palette', () => {
    const rows = [
      row(TARGET_A, '👏', ME),
      row(TARGET_A, '🦄', OTHER), // not in palette
    ];
    const result = aggregateReactions(rows, ME);
    expect(Object.keys(result[TARGET_A].counts)).toEqual(['👏']);
    expect(result[TARGET_A].mine).toEqual(['👏']);
  });

  it('aggregates reactions across multiple targets independently', () => {
    const rows = [
      row(TARGET_A, '⛳', ME),
      row(TARGET_B, '🔥', OTHER),
    ];
    const result = aggregateReactions(rows, ME);
    expect(result[TARGET_A].counts['⛳']).toBe(1);
    expect(result[TARGET_A].mine).toEqual(['⛳']);
    expect(result[TARGET_B].counts['🔥']).toBe(1);
    expect(result[TARGET_B].mine).toEqual([]);
  });

  it.each([
    ['👏', 1],
    ['🔥', 2],
    ['😂', 3],
    ['💪', 4],
    ['⛳', 5],
    ['🐦', 6],
  ] as [string, number][])(
    'accepts all palette emojis — %s yields count %i',
    (emoji, count) => {
      const rows = Array.from({ length: count }, (_, i) =>
        row(TARGET_A, emoji, `u${i}`),
      );
      const result = aggregateReactions(rows, ME);
      expect(result[TARGET_A].counts[emoji as '👏']).toBe(count);
    },
  );

  it('counts only include emojis with count > 0 (no zero-entries)', () => {
    const rows = [row(TARGET_A, '🔥', OTHER)];
    const result = aggregateReactions(rows, ME);
    const counts = result[TARGET_A].counts;
    for (const [, v] of Object.entries(counts)) {
      expect(v).toBeGreaterThan(0);
    }
    // Emojis not present should simply be absent from the object, not zero.
    expect('👏' in counts).toBe(false);
  });

  it('does not duplicate mine entries when same user appears twice for same emoji', () => {
    // Normally impossible due to DB unique constraint, but defensive test.
    const rows = [
      row(TARGET_A, '👏', ME),
      row(TARGET_A, '👏', ME),
    ];
    const result = aggregateReactions(rows, ME);
    expect(result[TARGET_A].mine.filter((e) => e === '👏')).toHaveLength(1);
  });
});
