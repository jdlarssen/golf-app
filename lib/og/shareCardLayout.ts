import type { ShareCardModel } from '@/lib/games/buildShareCardData';
import { isAutoGameName } from '@/lib/games/autoGameName';

/**
 * Every measure of the result card (`leaderboard/share-image`, #942) in one
 * place: the 1080×1350 portrait frame, the kicker, the row names, the headline
 * size and the height estimate (#2319).
 *
 * `ImageResponse` needs the height up front, so it is estimated from the
 * model. The card is 1350 high in every ordinary case; the estimate only lifts
 * it when a headline or a row name wraps further than usual, so nothing is cut
 * off. Satori wraps long text, so every headline or name is counted in lines.
 * Character budgets per line are conservative (they assume wider-than-average
 * glyphs) and come from real-font renders, not guesses.
 */

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1350;

/** Headline sizes: the artboard's 116px, and the fallback for a long headline. */
export const HEADLINE_FONT_SIZE = 116;
export const HEADLINE_FONT_SIZE_SMALL = 80;
/** The longest headline that still gets the full size, in lines. */
const HEADLINE_MAX_LINES = 3;

/** Characters that fit on one line, per text slot (conservative, measured). */
export const CHARS_PER_LINE = {
  /** Row name, Fraunces 500 48px beside the medallion and the number. */
  row: 27,
  /** Headline at the artboard's 116px, Fraunces 500. */
  headline: 14,
  /** Headline at the 80px fallback. */
  headlineSmall: 22,
  /** Kicker, Inter 600 26px uppercase with 0.26em tracking. */
  kicker: 36,
  /** Meta line, Inter 400 30px. */
  meta: 60,
} as const;

/** Greedy word wrap: how many lines `text` takes at `maxChars` per line. */
export function estimateLines(text: string, maxChars: number): number {
  let lines = 0;
  let current = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word.length > maxChars) {
      if (current > 0) lines++;
      lines += Math.ceil(word.length / maxChars) - 1;
      current = word.length % maxChars || maxChars;
    } else if (current === 0) {
      current = word.length;
    } else if (current + 1 + word.length <= maxChars) {
      current += 1 + word.length;
    } else {
      lines++;
      current = word.length;
    }
  }
  return Math.max(1, lines + (current > 0 ? 1 : 0));
}

/**
 * The kicker over the headline: the game's own name · the course. A name that
 * is the course, or the auto-generated «{course} {date}» (also in English),
 * would only repeat the course, so it gives the course alone. A name that just
 * starts with the course («Bogstad Open» on «Bogstad») is the organiser's own
 * and stays. No course: the name. Cut at one line (`CHARS_PER_LINE.kicker`,
 * counted in code points) with «…». Upper-casing is the caller's, with the
 * request locale.
 */
export function cardKicker(gameName: string, courseName: string | null): string {
  const name = gameName.trim();
  const course = courseName?.trim() ?? '';
  let text: string;
  if (!course) text = name;
  else if (isAutoGameName(name, course)) text = course;
  else text = `${name} · ${course}`;
  const chars = Array.from(text);
  return chars.length > CHARS_PER_LINE.kicker
    ? `${chars.slice(0, CHARS_PER_LINE.kicker - 1).join('').trimEnd()}…`
    : text;
}

/** The first word of a name: «Marte L.» → «Marte». */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/**
 * The name on one row: the members joined with « / ». A joined name longer
 * than a row's line budget is shortened to first names, so a row takes at most
 * two lines.
 */
export function rowDisplayName(memberNames: readonly string[]): string {
  const full = memberNames.join(' / ');
  if (full.length <= CHARS_PER_LINE.row) return full;
  return memberNames.map(firstName).join(' / ');
}

/** Lines `text` takes when each «\n» starts a new line of its own. */
function estimateBrokenLines(text: string, maxChars: number): number {
  return text
    .split('\n')
    .reduce((sum, part) => sum + estimateLines(part, maxChars), 0);
}

/**
 * Size and line count of the headline: 116px when the text fits on at most
 * three lines at that size, otherwise 80px. A «\n» in `text` is a forced
 * break (the result headline breaks before «med»/«på»).
 */
export function headlineLayout(text: string): { fontSize: number; lines: number } {
  const big = estimateBrokenLines(text, CHARS_PER_LINE.headline);
  if (big <= HEADLINE_MAX_LINES) return { fontSize: HEADLINE_FONT_SIZE, lines: big };
  return {
    fontSize: HEADLINE_FONT_SIZE_SMALL,
    lines: estimateBrokenLines(text, CHARS_PER_LINE.headlineSmall),
  };
}

/**
 * Picks how the headline is set from alternative line breakings of the same
 * text, best first (a forced break before «med»/«på», then one running block).
 * The first that fits at 116px wins; if none does, the last one is set at 80px.
 */
export function chooseHeadline(variants: readonly string[]): {
  index: number;
  fontSize: number;
  lines: number;
} {
  for (let index = 0; index < variants.length; index++) {
    const layout = headlineLayout(variants[index]);
    if (layout.fontSize === HEADLINE_FONT_SIZE) return { index, ...layout };
  }
  const index = variants.length - 1;
  return { index, ...headlineLayout(variants[index]) };
}

/** Pieces of the vertical stack, in px (the artboard's measures ×2). */
const TOP_PAD = 68;
const BOTTOM_PAD = 68;
const HEADER_ROW = 54;
const KICKER_GAP = 68;
const KICKER_LINE = 32;
const HEADLINE_GAP = 20;
const META_GAP = 20;
const META_LINE = 37;
const ROWS_GAP = 60;
const ROW_GAP = 20;
const ROW_FRAME = 52; // 24 + 24 padding, 2 + 2 border
const MEDALLION = 76;
const ROW_LINE = 58; // 48px Fraunces
const FOOTER_LINE = 32;
/** Air kept between the last row and the bottom line. */
const FOOTER_AIR = 40;

/** Lines the name on each row takes, in render order. */
function rowNames(model: ShareCardModel | null): string[] {
  if (model === null) return [];
  if (model.band === 'matchplay') {
    return model.match ? model.match.sides.map((s) => rowDisplayName(s.memberNames)) : [];
  }
  return model.podium.slice(0, 3).map((r) => rowDisplayName(r.memberNames));
}

export function shareCardHeight(
  model: ShareCardModel | null,
  opts: {
    headlineLines: number;
    headlineFontSize: number;
    /** The kicker as rendered (before upper-casing), for its line count. */
    kicker?: string;
    /** The meta line as rendered, for its line count. */
    meta?: string;
  },
): number {
  const kickerLines = opts.kicker ? estimateLines(opts.kicker, CHARS_PER_LINE.kicker) : 1;
  const metaLines = opts.meta ? estimateLines(opts.meta, CHARS_PER_LINE.meta) : 1;
  const names = rowNames(model);

  let h = TOP_PAD + HEADER_ROW;
  h += KICKER_GAP + kickerLines * KICKER_LINE;
  h += HEADLINE_GAP + opts.headlineLines * Math.ceil(opts.headlineFontSize * 1.02);
  h += META_GAP + metaLines * META_LINE;
  if (names.length > 0) {
    h += ROWS_GAP + (names.length - 1) * ROW_GAP;
    for (const name of names) {
      h += ROW_FRAME + Math.max(MEDALLION, estimateLines(name, CHARS_PER_LINE.row) * ROW_LINE);
    }
  }
  h += FOOTER_AIR + FOOTER_LINE + BOTTOM_PAD;
  return Math.max(SHARE_CARD_HEIGHT, h);
}
