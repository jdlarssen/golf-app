import type messages from '@/messages/no.json';

/**
 * Which message namespaces go to the browser (#2227).
 *
 * Without a `messages` prop, next-intl's root `NextIntlClientProvider` inlines
 * the WHOLE catalog (≈316 kB) into every page's RSC payload, including mail
 * copy, guides and landing pages no client component reads. The root layout
 * now sends only `ROOT_CLIENT_NAMESPACES`; the five heavy namespaces are added
 * by `<IntlScope>` in the layouts of the routes that need them.
 *
 * `i18n/clientNamespaces.test.ts` is the guard: it walks the import graph from
 * every route and fails when a client component reaches a namespace its route
 * does not provide, or when a namespace here is no longer used by any client
 * module.
 */
type Namespace = keyof typeof messages;

/** Namespaces client modules use on routes without a scope (≈100 kB). */
export const ROOT_CLIENT_NAMESPACES = [
  'SyncBanner',
  'allowance',
  'auth',
  'common',
  'courseForm',
  'demo',
  'error',
  'game',
  'holes',
  'inbox',
  'installBanner',
  'installButton',
  'installInstructions',
  'kavalkade',
  'kavalkadeShare',
  'klubb',
  'leaderboard',
  'legal',
  'modes',
  'nav',
  'onboarding',
  'passkey',
  'payment',
  'prizes',
  'profile',
  'pushSettings',
  'scorecard',
  'signup',
  'spectate',
] as const satisfies readonly Namespace[];

/** The heavy namespaces only some routes need; `<IntlScope>` adds them. */
export const SCOPED_NAMESPACES = [
  'admin',
  'wizard',
  'formatGuide',
  'cup',
  'liga',
] as const satisfies readonly Namespace[];

export type ScopedNamespace = (typeof SCOPED_NAMESPACES)[number];

/** The given top-level namespaces of a catalog, and nothing else. */
export function pickMessages<M extends Record<string, unknown>, K extends keyof M>(
  catalog: M,
  namespaces: readonly K[],
): Pick<M, K> {
  const picked = {} as Pick<M, K>;
  for (const ns of namespaces) {
    if (ns in catalog) picked[ns] = catalog[ns];
  }
  return picked;
}
