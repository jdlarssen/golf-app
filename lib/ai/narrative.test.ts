import { describe, it, expect } from 'vitest';
import {
  NARRATIVE_MAX_RETRIES,
  NARRATIVE_MODEL,
  NARRATIVE_TIMEOUT_MS,
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
    expect(NARRATIVE_TIMEOUT_MS).toBe(20_000);
    expect(NARRATIVE_MAX_RETRIES).toBe(1);
  });
});
