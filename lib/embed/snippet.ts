/**
 * buildEmbedSnippet — copy-paste-ready iframe snippet for the public embed
 * pages (#1024). Plain iframe on purpose: script-tag embeds are blocked by
 * several club-CMS-es (Squarespace code blocks, locked-down WordPress), while
 * an iframe pastes cleanly into a custom-HTML block everywhere. Fixed height
 * with the iframe's own scrollbar is the v1 trade-off; a responsive script
 * wrapper is a v2 idea (contract: Out of Scope).
 */

/** Every format without the compact card: the full board's frame (#1024). */
export const EMBED_HEIGHT = { full: 700 } as const;

// The compact card (#2330, `EmbedBoard.tsx`), as measured on staging. Owner
// 13.11: «Ja, etter sponsorene» — the frame is as high as the card, so it
// never scrolls between 320 and 480 px and has no air inside or under it.
/** Border 2 + top 48 + format line 18 + five rows 202 + «Vis alle» 45 + footer 34. */
const CARD_PX = 349;
/** The strip's padding (`py-2`), a logo row (`h-7`) and the gap between rows (`gap-y-2`). */
const STRIP_PAD_PX = 16;
const LOGO_ROW_PX = 28;
const LOGO_GAP_PX = 8;
/** Logos up to 112 px wide with a 16 px gap: two fit side by side at 320 px (286 px inside the strip). */
const LOGOS_PER_ROW = 2;
/** The names line (11 px Inter, normal line height ≈ 13.3 px) and its gap under the logos (`space-y-1.5`). */
const NAME_LINE_PX = 14;
const NAME_GAP_PX = 6;
/**
 * «Premier sponset av …» at 320 px: about 286 px of text width, ~6.5 px per
 * character, counted high. A capital counts 1.3: Inter's capitals are wider,
 * and name sets in capitals measured a whole line taller than 1.0 and 1.2
 * (rounds 2 and 3 of #2330). The line height has no slack of its own, so the
 * names get one line of margin on top (owner's rule: never scroll comes
 * before 14 px of air).
 */
const NAME_LINE_CHARS = 44;
const NAME_PREFIX_CHARS = 20;
const NAME_SEPARATOR_CHARS = 4;
const CAPITAL_CHARS = 1.3;
const NAME_MARGIN_LINES = 1;

/** A name's width in average characters. */
function nameWidth(name: string): number {
  let width = 0;
  for (const ch of name) width += ch !== ch.toLowerCase() ? CAPITAL_CHARS : 1;
  return width;
}

/**
 * The frame the compact card needs: the card with five rows, «Vis alle» and
 * the footer, plus the sponsor strip for these logos and names at the
 * narrowest width (320 px). A card that is shorter (fewer players, a reveal
 * game, wider frames with more logos per row) ends where its content ends
 * and the rest of the frame is transparent. Sponsors added after the code
 * was copied need a new copy.
 */
export function compactEmbedHeight(sponsors: { logos: number; names: readonly string[] }): number {
  const { logos, names } = sponsors;
  if (logos === 0 && names.length === 0) return CARD_PX;
  const rows = Math.ceil(logos / LOGOS_PER_ROW);
  const logoPx = rows === 0 ? 0 : rows * LOGO_ROW_PX + (rows - 1) * LOGO_GAP_PX;
  const nameChars = names.length === 0
    ? 0
    : NAME_PREFIX_CHARS + names.reduce((sum, n) => sum + nameWidth(n), 0) + (names.length - 1) * NAME_SEPARATOR_CHARS;
  const nameLines = nameChars === 0 ? 0 : Math.ceil(nameChars / NAME_LINE_CHARS) + NAME_MARGIN_LINES;
  const namePx = nameLines === 0 ? 0 : (rows === 0 ? 0 : NAME_GAP_PX) + nameLines * NAME_LINE_PX;
  return CARD_PX + STRIP_PAD_PX + logoPx + namePx;
}

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
  opts: {
    height: number;
    title: string;
    /**
     * #2330: the compact card's frame is transparent around the card. The
     * frame's own page is locked to light (globals.css), and a club page that
     * declares a dark scheme would otherwise get an opaque backdrop: the
     * scheme on the iframe element has to match.
     */
    lightScheme?: boolean;
  },
): string {
  const src = escapeAttr(url);
  const title = escapeAttr(opts.title);
  const scheme = opts.lightScheme ? 'color-scheme:light;' : '';
  return `<iframe src="${src}" title="${title}" style="width:100%;max-width:480px;height:${opts.height}px;border:0;border-radius:12px;${scheme}" loading="lazy"></iframe>`;
}
