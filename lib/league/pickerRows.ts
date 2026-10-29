/**
 * The rows of a league player picker (#2666): the round start's co-players and
 * the delivery's marker choice list the whole league, so both show a few rows,
 * a «Vis alle» line for the rest, and a search over everyone. One home for the
 * count and the rule, so the two pickers cannot drift (AGENTS.md trap 4).
 */
export const PICKER_VISIBLE_ROWS = 6;

export type PickerRows<T> = {
  /** The rows to draw, in the order given. */
  rows: T[];
  /** How many rows match the search (all rows when nothing is typed). */
  total: number;
  /** True when a search text is typed: «Vis alle» does not apply then. */
  searching: boolean;
  /** True when there are more rows than the cap, so «Vis alle» is offered. */
  canExpand: boolean;
};

/**
 * `items` come in the order they are drawn. A search lists every match. With
 * no search, and `showAll` off, only the first `PICKER_VISIBLE_ROWS` are drawn,
 * plus any `keepIds` row further down (a ticked player must stay on screen).
 */
export function pickerRows<T extends { userId: string }>(
  items: readonly T[],
  opts: {
    query: string;
    showAll: boolean;
    nameOf: (item: T) => string;
    keepIds?: ReadonlySet<string>;
  },
): PickerRows<T> {
  const needle = opts.query.trim().toLocaleLowerCase();
  const matches = needle
    ? items.filter((item) => opts.nameOf(item).toLocaleLowerCase().includes(needle))
    : [...items];
  const canExpand = !needle && matches.length > PICKER_VISIBLE_ROWS;
  const capped = canExpand && !opts.showAll;
  const rows = capped
    ? matches.filter((item, i) => i < PICKER_VISIBLE_ROWS || opts.keepIds?.has(item.userId))
    : matches;
  return { rows, total: matches.length, searching: needle !== '', canExpand };
}
