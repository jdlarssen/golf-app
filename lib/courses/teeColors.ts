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
