// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { checkNotes } from './check-changes-notes.mjs';

/**
 * Type A (#2256): the commit hook's note check says what the weekly release
 * would say. The rules themselves are `parseNote`'s, tested in
 * weekly-release.test.mjs; here only that the check reaches them, per file.
 */

const note = (lines) => ['---', ...lines, '---', 'Én setning om endringen.', ''].join('\n');

describe('checkNotes', () => {
  it('passes a valid feat note', () => {
    expect(checkNotes([{ file: '2256-ok.md', raw: note(['type: feat', 'issue: 2256', 'title: Noe nytt']) }])).toEqual([]);
  });

  it('stops a feat note without a title, and a fix note with one', () => {
    expect(
      checkNotes([
        { file: '2256-feat.md', raw: note(['type: feat', 'issue: 2256']) },
        { file: '2256-fix.md', raw: note(['type: fix', 'issue: 2256', 'title: Hører ikke hjemme']) },
      ]),
    ).toEqual([
      '2256-feat.md: feat-notat mangler «title»',
      '2256-fix.md: «title», «link» og «cta» hører kun til feat-notater',
    ]);
  });

  it('stops a cta without a link', () => {
    expect(
      checkNotes([{ file: '2256-cta.md', raw: note(['type: feat', 'issue: 2256', 'title: Noe nytt', 'cta: Åpne']) }]),
    ).toEqual(['2256-cta.md: «cta» krever «link» — ta med begge, eller ingen av dem']);
  });
});
