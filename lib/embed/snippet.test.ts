/**
 * Type A-tester for buildEmbedSnippet (#1024).
 */

import { describe, it, expect } from 'vitest';
import { buildEmbedSnippet, compactEmbedHeight, EMBED_HEIGHT } from './snippet';

describe('buildEmbedSnippet', () => {
  it('builds a plain iframe with src, title, height and lazy loading', () => {
    const snippet = buildEmbedSnippet('https://tornygolf.no/embed/liga/abc', {
      height: 600,
      title: 'Tørny – liga',
    });
    expect(snippet).toBe(
      '<iframe src="https://tornygolf.no/embed/liga/abc" title="Tørny – liga" style="width:100%;max-width:480px;height:600px;border:0;border-radius:12px;" loading="lazy"></iframe>',
    );
  });

  it('the compact card locks the frame to a light colour scheme, so a dark club page shows through (#2330)', () => {
    const snippet = buildEmbedSnippet('https://tornygolf.no/embed/spill/abc', {
      height: 349,
      title: 'Tørny – spill',
      lightScheme: true,
    });
    expect(snippet).toContain('style="width:100%;max-width:480px;height:349px;border:0;border-radius:12px;color-scheme:light;"');
  });

  it('escapes attribute-breaking characters in url and title', () => {
    const snippet = buildEmbedSnippet('https://x.no/e?a=1&b="2"', {
      height: 400,
      title: '<Liga> & "venner"',
    });
    expect(snippet).toContain('src="https://x.no/e?a=1&amp;b=&quot;2&quot;"');
    expect(snippet).toContain('title="&lt;Liga&gt; &amp; &quot;venner&quot;"');
    expect(snippet).not.toMatch(/src="[^"]*"[^ ]/);
  });
});

describe('compactEmbedHeight (#2330) — the frame the compact card needs', () => {
  // Measured on staging (Chromium, 320–480 px wide): the card with five rows,
  // «Vis alle» and the footer is 349 px; each row of logos adds to the strip.
  // Two 112 px logos fit side by side at 320 px, so the rows are ceil(n / 2).
  it.each([
    [0, 349],
    [1, 393],
    [2, 393],
    [3, 429],
    [4, 429],
    [5, 465],
    [6, 465],
    [7, 501],
  ])('%i logos → %i px', (logos, height) => {
    expect(compactEmbedHeight({ logos, names: [] })).toBe(height);
  });

  it('sponsor names without a logo add their text line under the strip', () => {
    const one = compactEmbedHeight({ logos: 0, names: ['Baren'] });
    expect(one).toBeGreaterThan(349);
    expect(compactEmbedHeight({ logos: 2, names: ['Baren'] })).toBeGreaterThan(393);
    // A long list wraps to more lines, so the frame grows with it.
    const long = compactEmbedHeight({ logos: 0, names: ['Klubbshoppen på Byneset', 'Golfbaren og kafeen', 'Fjordbrygga restaurant'] });
    expect(long).toBeGreaterThan(one);
  });

  it('capitals are wider: three names in capitals need 407 px at 320 px (measured, round 2)', () => {
    expect(
      compactEmbedHeight({ logos: 0, names: ['WILHELMSEN HAMAR TANNLEGESENTER', 'INTERIØR', 'BYNESET REGNSKAP'] }),
    ).toBeGreaterThanOrEqual(407);
  });
});

describe('EMBED_HEIGHT', () => {
  it('every other format keeps the full board\'s 700 px', () => {
    expect(EMBED_HEIGHT.full).toBe(700);
  });
});
