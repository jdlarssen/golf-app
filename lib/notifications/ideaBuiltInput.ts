import { routing } from '@/i18n/routing';
import { safeInternalPath } from '@/lib/url/safeInternalPath';

/**
 * The line and link an admin writes when marking an idea built (#2568). One
 * home for the rule (AGENTS.md trap #4): the admin action validates with it,
 * `ideaBuiltSchema` in `./types` refines with `isIdeaBuiltLink`, and the form
 * fields read the limits from here.
 *
 * The line comes from the latest launches (owner's choice 13.10, «Velg fra
 * siste lanseringer»), not from the idea's own text: `launchToIdeaBuilt` turns a
 * launch into a line and a link that pass this rule.
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
 * Why `link` (trimmed, non-empty) cannot go on an idea-built notice, or null
 * when it can. The admin action validates with it, and `launchToIdeaBuilt`
 * drops a launch's link that would fail here.
 */
export function ideaBuiltLinkError(link: string): IdeaBuiltInputError | null {
  if (!isIdeaBuiltLink(link)) return 'link_must_be_internal';
  if (link.length > IDEA_BUILT_LINK_MAX) return 'link_too_long';
  if (hasLocaleSegment(link)) return 'link_has_locale';
  return null;
}

/**
 * The line and link from one of the latest launches (owner's choice 13.10,
 * «Velg fra siste lanseringer»), not from the idea's own text. The admin form
 * fills both fields with it when a launch is picked.
 *
 * The title is cut at a word to fit `IDEA_BUILT_SUMMARY_MAX` (a launch title is
 * only capped in HTML). When no word cut leaves anything, it is cut hard,
 * counted in UTF-16 units like `.length` and `maxLength`, without splitting a
 * surrogate pair. A link the idea-built rule rejects becomes '', so a pick never
 * ends in an error after submit.
 */
export function launchToIdeaBuilt(launch: {
  title: string;
  link: string | null;
}): { summary: string; link: string } {
  const title = launch.title.replace(/\s+/g, ' ').trim();
  let summary = title;
  if (title.length > IDEA_BUILT_SUMMARY_MAX) {
    const cut = title.lastIndexOf(' ', IDEA_BUILT_SUMMARY_MAX);
    summary = cut > 0 ? title.slice(0, cut).replace(/[\s,;:]+$/, '') : '';
    if (!summary) {
      summary = title.slice(0, IDEA_BUILT_SUMMARY_MAX);
      const last = summary.charCodeAt(summary.length - 1);
      if (last >= 0xd800 && last <= 0xdbff) summary = summary.slice(0, -1);
    }
  }

  const link = (launch.link ?? '').trim();
  return { summary, link: link && ideaBuiltLinkError(link) === null ? link : '' };
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
    const error = ideaBuiltLinkError(link);
    if (error) return { ok: false, error };
  }

  return { ok: true, value: { summary, link: link || null } };
}
