// Type B: Norwegian catalog typos fixed in the 2026-11 pass must not return.
import { describe, expect, it } from 'vitest';
import no from '@/messages/no.json';

const TYPOS = [
  'etterhvert',
  'Match-en',
  'Vinner-laget',
  'Delt 1.-plass',
  'Knappe-tekst',
  'Spillmodus er låst',
  'Sesong start',
  'Sesong slutt',
];

describe('no.json known typos', () => {
  const text = JSON.stringify(no);
  it.each(TYPOS)('does not contain «%s»', (typo) => {
    expect(text).not.toContain(typo);
  });
});
