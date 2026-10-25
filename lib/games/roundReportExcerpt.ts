// How the AI round report (#1008) is shortened for places that cannot show it
// whole: the push text (server) and the quote in the app's board band (#2632).
// Pure and import-free so both the server and Metro can use it — one rule for
// what a sentence is, so the quote and the push start never drift apart.

const DEFAULT_MAX = 160;

/** Whitespace folded to single spaces, then split after `.`, `!` or `?`. */
export function sentences(report: string | null | undefined): string[] {
  const text = (report ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];
  return text.split(/(?<=[.!?])\s+/);
}

// Cuts at the last space that leaves room for the ellipsis, so a word is never
// split. A sentence with no space to cut at is cut hard.
function shorten(sentence: string, max: number): string {
  if (sentence.length <= max) return sentence;
  const at = sentence.lastIndexOf(' ', max - 1);
  const cut = at > 0 ? sentence.slice(0, at) : sentence.slice(0, max - 1);
  return `${cut.trimEnd()}…`;
}

/** The first sentence, verbatim; shortened with `…` when longer than `max`. */
export function reportQuote(
  report: string | null | undefined,
  max = DEFAULT_MAX,
): string | null {
  const first = sentences(report)[0];
  return first ? shorten(first, max) : null;
}

/** As many whole sentences from the start as fit within `max`. */
export function reportStart(
  report: string | null | undefined,
  max = DEFAULT_MAX,
): string | null {
  const all = sentences(report);
  if (all.length === 0) return null;
  let out = '';
  for (const s of all) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  return out || reportQuote(report, max);
}
