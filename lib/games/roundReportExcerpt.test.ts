import { describe, it, expect } from 'vitest';
import { reportQuote, reportStart, sentences } from './roundReportExcerpt';

describe('sentences', () => {
  it('returns [] for null, empty and whitespace-only text', () => {
    expect(sentences(null)).toEqual([]);
    expect(sentences('')).toEqual([]);
    expect(sentences('  \n ')).toEqual([]);
  });

  it('folds line breaks and runs of spaces into single spaces', () => {
    expect(sentences('Første.\n\nAndre   setning.')).toEqual(['Første.', 'Andre setning.']);
  });

  it('splits on ., ! and ? followed by a space or the end', () => {
    expect(sentences('Hva skjedde? Ingenting! Alt.')).toEqual(['Hva skjedde?', 'Ingenting!', 'Alt.']);
  });

  it('does not split inside a number or a word', () => {
    expect(sentences('Ada tok 36.5 poeng.')).toEqual(['Ada tok 36.5 poeng.']);
  });
});

describe('reportQuote', () => {
  it('returns null when there is no text', () => {
    expect(reportQuote(null)).toBeNull();
    expect(reportQuote('')).toBeNull();
    expect(reportQuote('   ')).toBeNull();
  });

  it('returns only the first sentence, verbatim', () => {
    expect(reportQuote('Ada tok den på 18. Bo svarte ikke.')).toBe('Ada tok den på 18.');
  });

  it('cuts a too-long first sentence at a space, ends on an ellipsis and stays within max', () => {
    const long = `${'ord '.repeat(60)}slutt.`;
    const out = reportQuote(long)!;
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('…')).toBe(true);
    const lastWord = out.slice(0, -1).split(' ').pop()!;
    expect(long.split(' ')).toContain(lastWord);
  });

  it('keeps a word that ends exactly at the cut', () => {
    const s = `${'a'.repeat(9)} ${'b'.repeat(9)}. rest`;
    // max 20 → first sentence is 20 chars, fits as is
    expect(reportQuote(s, 20)).toBe(`${'a'.repeat(9)} ${'b'.repeat(9)}.`);
    // max 19 → the final word no longer fits whole
    expect(reportQuote(s, 19)).toBe(`${'a'.repeat(9)}…`);
  });

  it('cuts hard when the first sentence has no space to cut at', () => {
    const out = reportQuote('x'.repeat(300))!;
    expect(out).toBe(`${'x'.repeat(159)}…`);
  });
});

describe('reportStart', () => {
  it('returns null when there is no text', () => {
    expect(reportStart(null)).toBeNull();
    expect(reportStart('  ')).toBeNull();
  });

  it('takes two whole sentences when both fit', () => {
    expect(reportStart('Ada tok den. Bo svarte. Cy lo.')).toBe('Ada tok den. Bo svarte. Cy lo.');
  });

  it('stops before the sentence that no longer fits', () => {
    const a = 'a'.repeat(80) + '.';
    const b = 'b'.repeat(70) + '.';
    const c = 'c'.repeat(30) + '.';
    // a + b = 152 + space fits within 160; adding c would not
    expect(reportStart(`${a} ${b} ${c}`)).toBe(`${a} ${b}`);
  });

  it('falls back to the shortened first sentence when it alone is too long', () => {
    const long = `${'ord '.repeat(60)}slutt. Neste.`;
    expect(reportStart(long)).toBe(reportQuote(long));
  });
});
