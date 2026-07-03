/**
 * buildEmbedSnippet — copy-paste-ready iframe snippet for the public embed
 * pages (#1024). Plain iframe on purpose: script-tag embeds are blocked by
 * several club-CMS-es (Squarespace code blocks, locked-down WordPress), while
 * an iframe pastes cleanly into a custom-HTML block everywhere. Fixed height
 * with the iframe's own scrollbar is the v1 trade-off; a responsive script
 * wrapper is a v2 idea (contract: Out of Scope).
 */

/** Escape the characters that could break out of a double-quoted attribute. */
function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function buildEmbedSnippet(
  url: string,
  opts: { height: number; title: string },
): string {
  const src = escapeAttr(url);
  const title = escapeAttr(opts.title);
  return `<iframe src="${src}" title="${title}" style="width:100%;max-width:480px;height:${opts.height}px;border:0;border-radius:12px;" loading="lazy"></iframe>`;
}
