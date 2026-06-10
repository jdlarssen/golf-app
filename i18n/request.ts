import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { locale as rootLocale } from 'next/root-params';
import { routing } from './routing';

type Messages = Record<string, unknown>;

// Catalog fallback: merge the requested locale ON TOP of the default-locale
// catalog, so a key missing in e.g. `en` renders the `no` string — never the
// raw key. (next-intl's documented fallback mechanism is exactly this merge.)
function mergeMessages(base: Messages, overlay: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    if (
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = mergeMessages(existing as Messages, value as Messages);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export default getRequestConfig(async () => {
  // Locale comes from the `[locale]` ROOT PARAM, not from a request header.
  // This is the cacheComponents-compatible pattern (Next 16.2 `next/root-params`
  // + `experimental.rootParams`): a route param is part of the prerender cache
  // key, so PPR static shells render per locale — reading next-intl's
  // middleware header here instead would mark every page dynamic (#538).
  const requested = await rootLocale();
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const defaultMessages = (
    await import(`../messages/${routing.defaultLocale}.json`)
  ).default as Messages;
  const messages =
    locale === routing.defaultLocale
      ? defaultMessages
      : mergeMessages(
          defaultMessages,
          (await import(`../messages/${locale}.json`)).default as Messages,
        );

  return {
    locale,
    messages,
    // Pin explicitly — otherwise next-intl serializes the SERVER's timezone
    // into the client provider (Europe/Oslo on the dev machine, UTC on
    // Vercel), making date output environment-dependent.
    timeZone: 'Europe/Oslo',
    // Last-resort guard for a key missing in BOTH catalogs (developer error):
    // render the human-ish last key segment instead of the full dotted path.
    getMessageFallback: ({ key }) => key.split('.').pop() ?? key,
  };
});
