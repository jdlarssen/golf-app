import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
  it('escapes the five characters HTML gives meaning to', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });

  it('escapes & first, so the entities it writes stay intact', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('replaces every occurrence, not just the first', () => {
    expect(escapeHtml('a&b&c')).toBe('a&amp;b&amp;c');
  });

  it('leaves other text as it is', () => {
    expect(escapeHtml('Ålesund GK — 3&2 😀')).toBe('Ålesund GK — 3&amp;2 😀');
    expect(escapeHtml('Øyvind Æsøy')).toBe('Øyvind Æsøy');
    expect(escapeHtml('')).toBe('');
  });
});
