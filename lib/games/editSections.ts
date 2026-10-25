/**
 * The parts of «Rediger spill» for a scheduled game (#2322): the overview lists
 * them, `?del=<key>` opens one, and the save sends you back to the part you
 * were in when it fails. A fixed list, so the key that comes back in a
 * redirect can never point anywhere else.
 *
 * Import-pure (no Supabase, no `server-only`): the app's edit screen will
 * import it by path when it comes (#1954).
 */
export const EDIT_SECTIONS = [
  'navn-og-tid',
  'bane',
  'format',
  'spillere',
  'pamelding',
  'innstillinger',
] as const;

export type EditSection = (typeof EDIT_SECTIONS)[number];

const SECTION_SET: ReadonlySet<string> = new Set(EDIT_SECTIONS);

export function isEditSection(value: unknown): value is EditSection {
  return typeof value === 'string' && SECTION_SET.has(value);
}
