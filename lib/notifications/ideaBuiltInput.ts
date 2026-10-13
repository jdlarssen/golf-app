import { routing } from '@/i18n/routing';
import { safeInternalPath } from '@/lib/url/safeInternalPath';

/**
 * The line and link an admin writes when marking an idea built (#2568). One
 * home for the rule (AGENTS.md trap #4): the admin action validates with it,
 * `ideaBuiltSchema` in `./types` refines with `isIdeaBuiltLink`, and the form
 * fields read the limits from here.
 *
 * Mirrors `lib/productUpdates/validateUpdateInput.ts`: a discriminated union so
 * the action can redirect with the error code (an i18n key under
 * `adminIdeer.errors`).
 */
export const IDEA_BUILT_SUMMARY_MAX = 120;
export const IDEA_BUILT_LINK_MAX = 200;

export type IdeaBuiltInputError =
  | 'summary_required'
  | 'summary_too_long'
  | 'link_must_be_internal'
  | 'link_too_long'
  | 'link_has_locale';

export const IDEA_BUILT_ERROR_CODES: ReadonlySet<string> = new Set<IdeaBuiltInputError>([
  'summary_required',
  'summary_too_long',
  'link_must_be_internal',
  'link_too_long',
  'link_has_locale',
]);

export type IdeaBuiltValidation =
  | { ok: true; value: { summary: string; link: string | null } }
  | { ok: false; error: IdeaBuiltInputError };

/**
 * A same-origin path with no whitespace. `safeInternalPath` lets a plain space
 * through, and `/cup x` would be a broken URL in the mail and in `href`.
 */
export function isIdeaBuiltLink(v: string): boolean {
  return safeInternalPath(v) !== null && !/\s/.test(v);
}

/**
 * `mailUrl` adds `/en` itself for English recipients, so `/en/cup` would become
 * `/en/en/cup`. Whole segments only: `/enkel` is a path, not a locale.
 */
function hasLocaleSegment(link: string): boolean {
  return routing.locales.some(
    (l) =>
      link === `/${l}` ||
      link.startsWith(`/${l}/`) ||
      link.startsWith(`/${l}?`) ||
      link.startsWith(`/${l}#`),
  );
}

/**
 * A first draft of the line, from the idea's own text (owner's choice 13.10):
 * its first sentence, cut at a word so it fits `IDEA_BUILT_SUMMARY_MAX`. The
 * admin form shows it as the field's starting value; the admin edits it. A
 * sentence ends at `.`, `!` or `?` followed by whitespace, so `2.5` stays whole.
 * Returns '' when there is nothing sensible to suggest.
 */
export function suggestIdeaBuiltSummary(ideaText: string): string {
  const text = ideaText.replace(/\s+/g, ' ').trim();
  const end = text.search(/[.!?](\s|$)/);
  const sentence = end === -1 ? text : text.slice(0, end + 1);
  if (sentence.length <= IDEA_BUILT_SUMMARY_MAX) return sentence;
  const cut = sentence.lastIndexOf(' ', IDEA_BUILT_SUMMARY_MAX);
  return cut <= 0 ? '' : sentence.slice(0, cut).replace(/[\s,;:]+$/, '');
}

export function validateIdeaBuiltInput(raw: {
  summary: string;
  link: string;
}): IdeaBuiltValidation {
  const summary = raw.summary.trim();
  const link = raw.link.trim();

  if (!summary) return { ok: false, error: 'summary_required' };
  if (summary.length > IDEA_BUILT_SUMMARY_MAX) return { ok: false, error: 'summary_too_long' };
  if (link) {
    if (!isIdeaBuiltLink(link)) return { ok: false, error: 'link_must_be_internal' };
    if (link.length > IDEA_BUILT_LINK_MAX) return { ok: false, error: 'link_too_long' };
    if (hasLocaleSegment(link)) return { ok: false, error: 'link_has_locale' };
  }

  return { ok: true, value: { summary, link: link || null } };
}
