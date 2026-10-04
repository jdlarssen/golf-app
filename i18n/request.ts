import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { locale as rootLocale } from 'next/root-params';
import { loadMessages } from '@/lib/i18n/messages';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  // Locale comes from the `[locale]` ROOT PARAM, not from a request header.
  // This is the cacheComponents-compatible pattern (Next 16.2 `next/root-params`
  // + `experimental.rootParams`): a route param is part of the prerender cache
  // key, so PPR static shells render per locale — reading next-intl's
  // middleware header here instead would mark every page dynamic (#538).
  //
  // EXCEPT in Server Actions: root params are unavailable there and the read
  // throws Next error E1014, which 500'd every action calling getLocale()/
  // getTranslations() (game creation among them). Fall back to next-intl's
  // requestLocale — it reads the header set by the proxy's intl middleware,
  // and a header read in the action phase can't hurt prerendering.
  let requested: string | undefined;
  try {
    requested = await rootLocale();
  } catch {
    requested = await requestLocale;
  }
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    // Default catalog underneath, the requested locale on top, so a key
    // missing in e.g. `en` renders the `no` string (lib/i18n/messages.ts).
    messages: await loadMessages(locale),
    // Pin explicitly — otherwise next-intl serializes the SERVER's timezone
    // into the client provider (Europe/Oslo on the dev machine, UTC on
    // Vercel), making date output environment-dependent.
    timeZone: 'Europe/Oslo',
    // Last-resort guard for a key missing in BOTH catalogs (developer error):
    // render the human-ish last key segment instead of the full dotted path.
    getMessageFallback: ({ key }) => key.split('.').pop() ?? key,
  };
});
