/**
 * Type A-tester for buildEmbedSnippet (#1024).
 */

import { describe, it, expect } from 'vitest';
import { buildEmbedSnippet } from './snippet';

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
