import { describe, it, expect } from 'vitest';
import {
  NARRATIVE_EFFORT,
  NARRATIVE_MAX_RETRIES,
  NARRATIVE_MAX_TOKENS,
  NARRATIVE_MODEL,
  NARRATIVE_TIMEOUT_MS,
  WEEKDAY_WORDS,
  findWeekday,
  numbersNotIn,
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

  it('a word that stands in the facts is a name, not a weekday', () => {
    // The evaluator's probe (27.11): a league or a game named after a day.
    const facts = JSON.stringify({ leagueName: 'Onsdagsligaen', gameName: 'Torsdagsgolfen 4' });
    expect(findWeekday('Onsdagsligaen er i gang, og Torsdagsgolfen 4 er spilt.', facts)).toBeNull();
    // The day itself is still a weekday, also when a name holds it.
    expect(findWeekday('Onsdagsligaen spilte på onsdag.', facts)).toBe('onsdag');
  });

  it('a name from the facts in another inflection is still a name (the evaluator, 27.11)', () => {
    const facts = JSON.stringify({ leagueName: 'Onsdagsligaen' });
    expect(findWeekday('Onsdagsligaens leder er Kari N.', facts)).toBeNull();
    // A bare day in the facts does not make its inflections names.
    expect(findWeekday('Onsdagen ble lang.', JSON.stringify({ label: 'Onsdag' }))).toBe('Onsdagen');
  });

  it('the list names the seven days, one home for the checks', () => {
    expect(WEEKDAY_WORDS).toEqual(['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag']);
  });
});

describe('numbersNotIn (#2983)', () => {
  it('lists each run of digits in the text that is not in the known text, once, with a decimal comma read as a point', () => {
    const known = JSON.stringify({ value: 44, avg: 41.5, label: 'Runde 2' });
    expect(numbersNotIn('44 poeng, 41,5 i snitt, Runde 2, 45 og 45 igjen, og 3,5.', known)).toEqual(['45', '3.5']);
  });
});

