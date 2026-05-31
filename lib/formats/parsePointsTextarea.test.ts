import { describe, it, expect } from 'vitest';
import { parsePointsTextarea } from './parsePointsTextarea';

describe('parsePointsTextarea', () => {
  it('konverterer newline-separert tekst til string[]', () => {
    const result = parsePointsTextarea('Linje én\nLinje to\nLinje tre');
    expect(result).toEqual(['Linje én', 'Linje to', 'Linje tre']);
  });

  it('trimmer whitespace rundt hver linje', () => {
    const result = parsePointsTextarea('  første  \n  andre  ');
    expect(result).toEqual(['første', 'andre']);
  });

  it('filtrerer vekk tomme linjer', () => {
    const result = parsePointsTextarea('første\n\n\nandre\n');
    expect(result).toEqual(['første', 'andre']);
  });

  it('returnerer null når input er tom streng', () => {
    expect(parsePointsTextarea('')).toBeNull();
  });

  it('returnerer null når input kun inneholder whitespace og newlines', () => {
    expect(parsePointsTextarea('  \n  \n  ')).toBeNull();
  });

  it('returnerer null når alle linjer er tomme etter trim', () => {
    expect(parsePointsTextarea('\n\n\n')).toBeNull();
  });

  it('håndterer enkeltlinje uten newline', () => {
    expect(parsePointsTextarea('Én linje')).toEqual(['Én linje']);
  });
});
