/**
 * splitFormatsForCount — which format the wizard recommends for a player count
 * (#2260).
 *
 * The catalogue arrives sorted by `getFormatsForIntent` (is_primary desc,
 * sort_order, format_slug), so the recommendation is just «the first format
 * that fits», and the order is set in the catalogue, not in code. The three
 * after it are «Andre som passer»; everything else that fits sits behind the
 * «Se alle N som passer» link. Pure logic, no UI dependencies — the native
 * app can read it later.
 */

import type { FormatForIntent } from '@/lib/formats/getFormatsForIntent';
import type { GameMode } from '@/lib/scoring/modes/types';
import { fitsPlayerCount } from './fitsPlayerCount';

/** How many formats «Andre som passer» shows under the recommendation. */
export const OTHER_FORMATS_SHOWN = 3;

export type FormatSplit = {
  /** The first format that fits. Undefined without a count or a fit. */
  recommended: FormatForIntent | undefined;
  /** The next three, plus the selected format when it sits in the rest. */
  others: FormatForIntent[];
  /** Everything else that fits — the whole catalogue without a count. */
  rest: FormatForIntent[];
  /** How many formats fit the count (all three groups together). */
  fittingCount: number;
};

export function splitFormatsForCount(
  formats: readonly FormatForIntent[],
  count: number | undefined,
  selected: string | undefined,
): FormatSplit {
  if (count === undefined) {
    return {
      recommended: undefined,
      others: [],
      rest: [...formats],
      fittingCount: formats.length,
    };
  }

  const fitting = formats.filter((f) => fitsPlayerCount(f.slug as GameMode, count));
  const [recommended, ...after] = fitting;
  const others = after.slice(0, OTHER_FORMATS_SHOWN);
  let rest = after.slice(OTHER_FORMATS_SHOWN);

  // The selection is always on screen: a format picked from the rest (or
  // resumed from a draft) moves up as an extra row in «Andre».
  const selectedInRest = rest.find((f) => f.slug === selected);
  if (selectedInRest) {
    others.push(selectedInRest);
    rest = rest.filter((f) => f !== selectedInRest);
  }

  return { recommended, others, rest, fittingCount: fitting.length };
}
