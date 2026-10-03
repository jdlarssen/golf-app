import type { ShareCardModel } from '@/lib/games/buildShareCardData';

/**
 * Content-fit height of the result card (`leaderboard/share-image`, #942).
 * `ImageResponse` needs the height up front, so it is estimated from the
 * model: a thin result (matchplay, 2-player) becomes a snug card instead of a
 * tall photo with a blank lower half once shared into a chat. Estimates are
 * deliberately generous so the card never clips; the footer's marginTop:auto
 * absorbs any small slack at the bottom.
 *
 * Satori wraps long names, so every name or headline is counted in lines
 * (#2318): a tied first place between teams puts long joined team names in
 * the 56px hero blocks. Character budgets per line are conservative (they
 * assume wider-than-average glyphs); a one-line card keeps the exact height
 * it had before line counting.
 */

/** Characters that fit on one line, per text slot (conservative). */
export const CHARS_PER_LINE = {
  /** Winner name, Fraunces 56px in the hero block. */
  winner: 23,
  /** Runner-up row and «Din runde» strip name, Inter 40px beside the score. */
  row: 30,
  /** Matchplay headline, Fraunces 64px in the result band. */
  headline: 23,
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

/** Extra height of a 40px row name past one line: the 64px disc sets the floor. */
function extraRowHeight(name: string): number {
  return Math.max(0, estimateLines(name, CHARS_PER_LINE.row) * 48 - 64);
}

export function computeCardHeight(
  model: ShareCardModel | null,
  opts: {
    /** Lines the game title takes (64px serif). */
    nameLines: number;
    hasMeta: boolean;
    /** The rendered matchplay headline, for the matchplay band. */
    headline?: string;
  },
): number {
  let h = 72 /* top pad */ + 76 /* header */;
  h += 36 + opts.nameLines * 80 + (opts.hasMeta ? 16 + 42 : 0); // name + meta
  h += 42; // divider
  if (model === null) {
    h += 160;
  } else if (model.band === 'matchplay') {
    h += 8 + 200; // result band
    // 64px headline lines past the first (77px each).
    h += (estimateLines(opts.headline ?? '', CHARS_PER_LINE.headline) - 1) * 77;
  } else {
    // One winner block per tied first place (#2318), 16px apart. A block
    // renders ~233px; the first keeps its historic 196 (the footer slack
    // absorbs the rest, so a single-winner card is unchanged), but every extra
    // block must be counted at full height or 3 winners clip the footer.
    const winnerCount = model.winners.length;
    if (winnerCount > 0) h += 196 + (winnerCount - 1) * (16 + 236);
    h += 8;
    // 56px winner-name lines past the first (67px each).
    for (const w of model.winners) {
      h += (estimateLines(w.name, CHARS_PER_LINE.winner) - 1) * 67;
    }
    for (const row of model.podium.slice(winnerCount)) {
      h += 116 + extraRowHeight(row.name); // runner rows
    }
    if (model.sharerStrip) {
      h += 16 + 116 + extraRowHeight(model.sharerStrip.name); // sharer row
      if (model.sharerStrip.rank > model.podium.length + 1) h += 52; // gap marker
    }
  }
  if (model && model.sideTournaments.length > 0) h += 28 + 96; // chips
  h += 24 + 2 + 104; // footer (divider + two lines)
  h += 72; // bottom pad
  return h;
}
