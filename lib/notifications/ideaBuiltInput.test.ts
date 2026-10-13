import { describe, it, expect } from 'vitest';
import {
  IDEA_BUILT_LINK_MAX,
  IDEA_BUILT_SUMMARY_MAX,
  suggestIdeaBuiltSummary,
  validateIdeaBuiltInput,
  type IdeaBuiltInputError,
} from './ideaBuiltInput';
import { parseNotificationPayload } from './types';

// #2568: the line and link an admin writes when marking an idea built. One
// home for the rule — the admin action, the zod schema and the form fields all
// read it from here.

const SUBMISSION = '33333333-3333-3333-3333-333333333333';

function v(summary: string, link = '') {
  return validateIdeaBuiltInput({ summary, link });
}

describe('validateIdeaBuiltInput — summary', () => {
  it.each([
    ['', 'summary_required'],
    ['   ', 'summary_required'],
    ['x'.repeat(IDEA_BUILT_SUMMARY_MAX + 1), 'summary_too_long'],
  ] as const)('%j → %s', (summary, error) => {
    expect(v(summary)).toEqual({ ok: false, error });
  });

  it('accepts exactly the max length and trims', () => {
    const line = 'x'.repeat(IDEA_BUILT_SUMMARY_MAX);
    expect(v(`  ${line}  `)).toEqual({ ok: true, value: { summary: line, link: null } });
  });
});

describe('validateIdeaBuiltInput — link', () => {
  it.each([
    ['', null],
    [' /cup ', '/cup'],
    ['/cup', '/cup'],
    ['/cup"x', '/cup"x'],
    ['/enkel', '/enkel'],
    ['/endringer', '/endringer'],
    ['/nokkel', '/nokkel'],
  ] as const)('%j → accepted as %j', (link, expected) => {
    expect(v('Ryder Cup', link)).toEqual({
      ok: true,
      value: { summary: 'Ryder Cup', link: expected },
    });
  });

  it.each([
    ['https://x.no', 'link_must_be_internal'],
    ['//evil.no', 'link_must_be_internal'],
    ['/cup x', 'link_must_be_internal'],
    ['/cup x', 'link_must_be_internal'],
    [`/${'a'.repeat(IDEA_BUILT_LINK_MAX)}`, 'link_too_long'],
    ['/en', 'link_has_locale'],
    ['/en/cup', 'link_has_locale'],
    ['/en?x', 'link_has_locale'],
    ['/no', 'link_has_locale'],
    ['/no/cup', 'link_has_locale'],
  ] as const)('%j → %s', (link, error) => {
    expect(v('Ryder Cup', link)).toEqual({ ok: false, error });
  });
});

// Parity: what the validator lets through, the schema stores; what it stops,
// the schema stops too. `link_has_locale` is the validator's rule alone.
describe('validator ↔ ideaBuiltSchema parity', () => {
  const cases: Array<{ summary: string; link: string }> = [
    { summary: 'Ryder Cup', link: '' },
    { summary: '  Ryder Cup  ', link: ' /cup ' },
    { summary: 'Ryder Cup', link: '/cup"x' },
    { summary: 'Ryder Cup', link: '/enkel' },
    { summary: 'x'.repeat(IDEA_BUILT_SUMMARY_MAX), link: '/cup' },
    { summary: '   ', link: '' },
    { summary: 'x'.repeat(IDEA_BUILT_SUMMARY_MAX + 1), link: '' },
    { summary: 'Ryder Cup', link: 'https://x.no' },
    { summary: 'Ryder Cup', link: '//evil.no' },
    { summary: 'Ryder Cup', link: '/cup x' },
    { summary: 'Ryder Cup', link: '/cup x' },
    { summary: 'Ryder Cup', link: `/${'a'.repeat(IDEA_BUILT_LINK_MAX)}` },
  ];
  const SKIP: ReadonlySet<IdeaBuiltInputError> = new Set(['link_has_locale']);

  it.each(cases)('$summary / $link', (raw) => {
    const result = validateIdeaBuiltInput(raw);
    if (result.ok) {
      const { summary, link } = result.value;
      expect(() =>
        parseNotificationPayload('idea_built', {
          submission_id: SUBMISSION,
          summary,
          ...(link ? { link } : {}),
        }),
      ).not.toThrow();
      return;
    }
    if (SKIP.has(result.error)) return;
    const link = raw.link.trim();
    expect(() =>
      parseNotificationPayload('idea_built', {
        submission_id: SUBMISSION,
        summary: raw.summary.trim(),
        ...(link ? { link } : {}),
      }),
    ).toThrow();
  });
});

// Owner's choice 13.10: the line is prefilled from the idea's own text — its
// first sentence, cut at a word within the limit. No AI.
describe('suggestIdeaBuiltSummary', () => {
  it('empty or blank text → no suggestion', () => {
    expect(suggestIdeaBuiltSummary('')).toBe('');
    expect(suggestIdeaBuiltSummary('  \n  ')).toBe('');
  });

  it('takes the first of several sentences', () => {
    expect(suggestIdeaBuiltSummary('Vis vind på hvert hull. Gjerne med pil! Og styrke?')).toBe(
      'Vis vind på hvert hull.',
    );
    expect(suggestIdeaBuiltSummary('Kan dere lage Ryder Cup? Vi er 16 stk.')).toBe(
      'Kan dere lage Ryder Cup?',
    );
  });

  it('text without a full stop is used whole, whitespace collapsed', () => {
    expect(suggestIdeaBuiltSummary('  Ryder Cup-oppsett\nfor klubben  ')).toBe(
      'Ryder Cup-oppsett for klubben',
    );
  });

  it('a dot inside a number or path does not end the sentence', () => {
    expect(suggestIdeaBuiltSummary('Vis 2.5 slag i snitt per hull. Takk')).toBe(
      'Vis 2.5 slag i snitt per hull.',
    );
  });

  it('long text is cut at a word, never inside one, within the limit', () => {
    const words = Array.from({ length: 40 }, (_, i) => `ord${i}`).join(' ');
    const out = suggestIdeaBuiltSummary(words);
    expect(out.length).toBeLessThanOrEqual(IDEA_BUILT_SUMMARY_MAX);
    expect(words.startsWith(out)).toBe(true);
    expect(words[out.length]).toBe(' ');
    expect(validateIdeaBuiltInput({ summary: out, link: '' }).ok).toBe(true);
  });

  it('one word longer than the limit → no suggestion rather than half a word', () => {
    expect(suggestIdeaBuiltSummary('x'.repeat(IDEA_BUILT_SUMMARY_MAX + 5))).toBe('');
  });
});
