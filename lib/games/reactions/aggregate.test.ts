import { describe, it, expect } from 'vitest';
import { aggregateReactions, applyToggle, topReactions, type ReactionRow } from './aggregate';
import { EMOJI_NAME_KEY, REACTION_EMOJIS } from './palette';

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

describe('applyToggle', () => {
  it('adds a reaction the viewer has not given', () => {
    const next = applyToggle({}, TARGET_A, '👏');
    expect(next[TARGET_A]).toEqual({ counts: { '👏': 1 }, mine: ['👏'] });
  });

  it('removes a reaction the viewer has given, and drops a count that reaches zero', () => {
    const next = applyToggle({ [TARGET_A]: { counts: { '👏': 1 }, mine: ['👏'] } }, TARGET_A, '👏');
    expect(next[TARGET_A]).toEqual({ counts: {}, mine: [] });
  });

  it('keeps the other givers in the count', () => {
    const next = applyToggle({ [TARGET_A]: { counts: { '🔥': 3 }, mine: ['🔥'] } }, TARGET_A, '🔥');
    expect(next[TARGET_A]).toEqual({ counts: { '🔥': 2 }, mine: [] });
  });

  it('is undone by toggling once more', () => {
    const start = { [TARGET_A]: { counts: { '🔥': 2 }, mine: [] } };
    expect(applyToggle(applyToggle(start, TARGET_A, '🔥'), TARGET_A, '🔥')).toEqual(start);
  });

  it('leaves other targets and the input alone', () => {
    const start = { [TARGET_B]: { counts: { '😂': 1 }, mine: [] } };
    const next = applyToggle(start, TARGET_A, '👏');
    expect(next[TARGET_B]).toBe(start[TARGET_B]);
    expect(start).toEqual({ [TARGET_B]: { counts: { '😂': 1 }, mine: [] } });
  });
});

describe('topReactions', () => {
  it('sorts by count and keeps at most three', () => {
    expect(topReactions({ '👏': 1, '🔥': 5, '😂': 3, '💪': 2 })).toEqual([
      ['🔥', 5],
      ['😂', 3],
      ['💪', 2],
    ]);
  });

  it('skips a zero count and returns nothing for an empty row', () => {
    expect(topReactions({ '👏': 0 })).toEqual([]);
    expect(topReactions({})).toEqual([]);
  });
});

describe('EMOJI_NAME_KEY', () => {
  it('names every emoji in the palette', () => {
    expect(REACTION_EMOJIS.map((emoji) => EMOJI_NAME_KEY[emoji])).toEqual([
      'clap', 'fire', 'laugh', 'strong', 'golf', 'birdie',
    ]);
  });
});
