// lib/legal/terms.ts
// #3019: the version of the terms at /legal/vilkar. A player accepts a
// version once (public.terms_acceptances, 0259). Raise it when the text
// changes in a way players must accept again; the app then asks once more.
export const TERMS_VERSION = 1;

/** The public page, for links from the app and the footer. */
export const TERMS_PATH = '/legal/vilkar';

/** Where players reach Tørny (Apple guideline 1.2: published contact). */
export const CONTACT_EMAIL = 'personvern@tornygolf.no';
