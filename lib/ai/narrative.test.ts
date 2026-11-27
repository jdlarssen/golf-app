import { describe, it, expect } from 'vitest';
import {
  NARRATIVE_EFFORT,
  NARRATIVE_MAX_RETRIES,
  NARRATIVE_MAX_TOKENS,
  NARRATIVE_MODEL,
  NARRATIVE_TIMEOUT_MS,
  WEEKDAY_WORDS,
  findWeekday,
  sanitizeNarrative,
} from './narrative';

describe('sanitizeNarrative', () => {
  it('trims and keeps ordinary prose', () => {
    expect(sanitizeNarrative('  Et fint år.  ', 100)).toBe('Et fint år.');
  });

  it('rejects an empty answer', () => {
    expect(sanitizeNarrative('', 100)).toBeNull();
    expect(sanitizeNarrative('   \n  ', 100)).toBeNull();
  });

  it('strips a wrapping code fence', () => {
    expect(sanitizeNarrative('```\nEt fint år.\n```', 100)).toBe('Et fint år.');
    expect(sanitizeNarrative('```text\nEt fint år.\n```', 100)).toBe('Et fint år.');
  });

  it('strips one pair of wrapping quotes', () => {
    expect(sanitizeNarrative('"Et fint år."', 100)).toBe('Et fint år.');
    expect(sanitizeNarrative("'Et fint år.'", 100)).toBe('Et fint år.');
  });

  it('collapses runs of blank lines', () => {
    expect(sanitizeNarrative('Første.\n\n\n\nAndre.', 100)).toBe('Første.\n\nAndre.');
  });

  // Lengdegrensen er det eneste de to flatene ikke deler — referatet tåler
  // 1500 tegn, kavalkadens innledning 700. Derfor er den en parameter.
  it('honours the caller’s length limit', () => {
    const text = 'a'.repeat(120);
    expect(sanitizeNarrative(text, 200)).toBe(text);
    expect(sanitizeNarrative(text, 100)).toBeNull();
  });

  it('measures the length AFTER cleaning, not before', () => {
    // 100 tegn tekst i en fence på 108 tegn: fencen skal ikke telle med.
    const text = 'b'.repeat(100);
    expect(sanitizeNarrative(`\`\`\`\n${text}\n\`\`\``, 100)).toBe(text);
  });
});

describe('delte konstanter', () => {
  it('holder modell, timeout og retries på ett sted', () => {
    expect(NARRATIVE_MODEL).toBe('claude-sonnet-5');
    expect(NARRATIVE_EFFORT).toBe('low');
    expect(NARRATIVE_MAX_TOKENS).toBe(4_000);
    expect(NARRATIVE_TIMEOUT_MS).toBe(20_000);
    expect(NARRATIVE_MAX_RETRIES).toBe(1);
  });
});

describe('findWeekday (#2983)', () => {
  it.each([
    ['Han leverte på lørdag.', 'lørdag'],
    ['Søndagskvelden ble lang.', 'Søndagskvelden'],
    ['Mandagen starter runden.', 'Mandagen'],
    ['tirsdager er tunge', 'tirsdager'],
    ['onsdag, torsdag og fredag', 'onsdag'],
  ])('finds a weekday in any inflection: %s', (text, found) => {
    expect(findWeekday(text)).toBe(found);
  });

  it.each(['Han tok helgen.', 'Søndre Land', 'En formann og en dag på banen.', 'Kalender og ukeplan.'])(
    'finds none where none is: %s',
    (text) => {
      expect(findWeekday(text)).toBeNull();
    },
  );

  it('the list names the seven days, one home for the prompts and the checks', () => {
    expect(WEEKDAY_WORDS).toEqual(['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag']);
  });
});

