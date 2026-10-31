/**
 * A tee's colour (#2277): the key stored in `tee_boxes.color`. The palette has
 * one home here and in `tee_boxes_color_check` (0206_tee_box_color.sql);
 * teeColors.test.ts locks the two together. The hex values are tokens in
 * app/globals.css (`--tee-white` …), the same by day and by night.
 */
export const TEE_COLORS = ['white', 'yellow', 'red', 'blue', 'orange'] as const;

export type TeeColor = (typeof TEE_COLORS)[number];

export function isTeeColor(value: unknown): value is TeeColor {
  return typeof value === 'string' && (TEE_COLORS as readonly string[]).includes(value);
}

/**
 * The dot's colour class for each key, shared by the course page (TeePanel) and
 * the course form. A static map, so a new key in TEE_COLORS fails tsc until it
 * has a dot.
 */
export const TEE_DOT_CLASS: Record<TeeColor, string> = {
  white: 'bg-tee-white',
  yellow: 'bg-tee-yellow',
  red: 'bg-tee-red',
  blue: 'bg-tee-blue',
  orange: 'bg-tee-orange',
};

/**
 * A colour tee's name (#2486). The course is Norwegian, so the stored name is
 * the Norwegian word whatever the browser's language; only the chip's label
 * is translated.
 */
export const TEE_COLOR_NAMES: Record<TeeColor, string> = {
  white: 'Hvit',
  yellow: 'Gul',
  red: 'Rød',
  blue: 'Blå',
  orange: 'Oransje',
};

const COLOR_BY_NAME = new Map<string, TeeColor>(
  TEE_COLORS.map((key) => [TEE_COLOR_NAMES[key].toLocaleLowerCase('nb'), key]),
);

/**
 * The dot in front of a tee on «Hvor og når?» (#2448): the stored colour, or
 * else the colour the name says, with the rule 0225 backfilled by (the whole
 * name, any case, outer spaces ignored). `null` is the neutral dot: «Men's
 * III» or «57» names no colour.
 */
export function teeDotColor(tee: { color: string | null; name: string }): TeeColor | null {
  if (isTeeColor(tee.color)) return tee.color;
  return COLOR_BY_NAME.get(tee.name.trim().toLocaleLowerCase('nb')) ?? null;
}
