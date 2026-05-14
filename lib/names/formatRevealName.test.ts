import { describe, it, expect } from 'vitest';
import { formatRevealName } from './formatRevealName';

describe('formatRevealName', () => {
  it('returns name unchanged when nickname is null', () => {
    expect(formatRevealName('Karl Jensen', null)).toBe('Karl Jensen');
  });

  it('returns name unchanged when nickname is empty or whitespace', () => {
    expect(formatRevealName('Karl Jensen', '')).toBe('Karl Jensen');
    expect(formatRevealName('Karl Jensen', '   ')).toBe('Karl Jensen');
  });

  it('inserts nickname between first and last word for 2-word name', () => {
    expect(formatRevealName('Karl Jensen', 'Knølkis')).toBe(
      'Karl "Knølkis" Jensen',
    );
  });

  it('inserts nickname between first and last word for 3-word name', () => {
    expect(formatRevealName('Karl Erik Jensen', 'Knølkis')).toBe(
      'Karl "Knølkis" Jensen',
    );
  });

  it('inserts nickname between first and last word for 4-word name', () => {
    expect(formatRevealName('Sondre Reitan Aar Junior', 'Pingvin')).toBe(
      'Sondre "Pingvin" Junior',
    );
  });

  it('appends nickname when name is a single word', () => {
    expect(formatRevealName('Karl', 'Knølkis')).toBe('Karl "Knølkis"');
  });

  it('handles unicode names (Norwegian characters)', () => {
    expect(formatRevealName('Bjørn Åge Østby', 'Knølkis')).toBe(
      'Bjørn "Knølkis" Østby',
    );
  });

  it('trims leading/trailing whitespace from name', () => {
    expect(formatRevealName('  Karl Jensen  ', 'Knølkis')).toBe(
      'Karl "Knølkis" Jensen',
    );
  });

  it('collapses multiple spaces in name', () => {
    expect(formatRevealName('Karl   Jensen', 'Knølkis')).toBe(
      'Karl "Knølkis" Jensen',
    );
  });

  it('trims whitespace from nickname', () => {
    expect(formatRevealName('Karl Jensen', '  Knølkis  ')).toBe(
      'Karl "Knølkis" Jensen',
    );
  });
});
