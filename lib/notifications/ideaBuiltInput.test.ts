import { describe, it, expect } from 'vitest';
import {
  IDEA_BUILT_LINK_MAX,
  IDEA_BUILT_SUMMARY_MAX,
  launchToIdeaBuilt,
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

// Owner's choice 13.10, «Velg fra siste lanseringer»: the admin picks one of the
// latest launches and its title and link fill the two fields. The idea's own
// text is no longer a source.
describe('launchToIdeaBuilt', () => {
  const GOLFER = '\u{1F3CC}'; // outside the BMP: two UTF-16 units

  it('a short title and a valid link pass through, trimmed', () => {
    expect(launchToIdeaBuilt({ title: '  Ryder Cup-oppsett  ', link: ' /spillformater ' })).toEqual({
      summary: 'Ryder Cup-oppsett',
      link: '/spillformater',
    });
  });

  it('no link → empty link', () => {
    expect(launchToIdeaBuilt({ title: 'Cup', link: null }).link).toBe('');
    expect(launchToIdeaBuilt({ title: 'Cup', link: '   ' }).link).toBe('');
  });

  it('a link the idea-built rule rejects → empty link, never a submit error', () => {
    for (const link of ['/en/cup', 'https://example.com', '/cup x', '/' + 'a'.repeat(IDEA_BUILT_LINK_MAX)]) {
      expect(launchToIdeaBuilt({ title: 'Cup', link }).link).toBe('');
    }
  });

  it('a long title is cut at the last space within the limit, no trailing comma', () => {
    const title = 'a'.repeat(110) + ', bbbbbbbbbbbbbbbbbbbb';
    const { summary } = launchToIdeaBuilt({ title, link: null });
    expect(summary).toBe('a'.repeat(110));
    expect(validateIdeaBuiltInput({ summary, link: '' }).ok).toBe(true);
  });

  it('a long title without spaces is cut hard at the limit', () => {
    expect(launchToIdeaBuilt({ title: 'x'.repeat(130), link: null }).summary).toBe(
      'x'.repeat(IDEA_BUILT_SUMMARY_MAX),
    );
  });

  it('a hard cut never leaves half an emoji', () => {
    const title = 'a' + GOLFER.repeat(61); // 123 units, no space
    const { summary } = launchToIdeaBuilt({ title, link: null });
    expect(summary).toBe('a' + GOLFER.repeat(59));
    expect(summary.length).toBe(119);
    const last = summary.charCodeAt(summary.length - 1);
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
  });

  it('falls back to a hard cut when the word cut would leave nothing', () => {
    const { summary } = launchToIdeaBuilt({ title: ': ' + 'x'.repeat(200), link: null });
    expect(summary).not.toBe('');
    expect(summary.length).toBe(IDEA_BUILT_SUMMARY_MAX);
  });

  it('collapses line breaks and double spaces', () => {
    expect(launchToIdeaBuilt({ title: 'Ryder Cup-oppsett\n\nfor  klubben', link: null }).summary).toBe(
      'Ryder Cup-oppsett for klubben',
    );
  });
});
