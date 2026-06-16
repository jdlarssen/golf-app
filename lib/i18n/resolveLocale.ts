import { routing, type AppLocale } from '@/i18n/routing';

// Norwegian browsers send nb/nn (bokmål/nynorsk) — both map to our 'no'.
const LANGUAGE_ALIASES: Record<string, AppLocale> = {
  nb: 'no',
  nn: 'no',
};

/** Narrow an arbitrary string (DB value, cookie) to a supported locale. */
export function toSupportedLocale(value: string | null | undefined): AppLocale | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if ((routing.locales as readonly string[]).includes(normalized)) {
    return normalized as AppLocale;
  }
  return LANGUAGE_ALIASES[normalized] ?? null;
}

/**
 * Pick the best supported locale from an Accept-Language header.
 * Minimal q-value parsing — we only distinguish the locales in
 * `routing.locales` (plus nb/nn aliases), so full BCP 47 matching is overkill.
 */
export function matchAcceptLanguage(header: string | null | undefined): AppLocale | null {
  if (!header) return null;
  const candidates = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isNaN(q) ? 0 : q };
    })
    .filter((c) => c.tag && c.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of candidates) {
    const base = tag.split('-')[0];
    const match = toSupportedLocale(tag) ?? toSupportedLocale(base);
    if (match) return match;
  }
  return null;
}

/**
 * Locale negotiation precedence (#475, locked in contract):
 *   users.locale -> NEXT_LOCALE cookie -> Accept-Language -> default 'no'.
 *
 * #640 item 6: `signedIn` short-circuits the Accept-Language step. A logged-in
 * user who hasn't picked a language (NULL `users.locale`, no cookie) should get
 * the app default ('no'), not their browser's language — an English-language
 * browser was routing a Norwegian-profiled admin to /en on first visit. The
 * browser language is a fine signal for an anonymous visitor (who has no
 * profile to consult), so it stays in the chain when `signedIn` is falsy.
 *
 * Pure so the chain is unit-testable without the proxy. The proxy feeds it
 * request data and routes the result into next-intl via the locale cookie.
 */
export function resolveLocale(input: {
  userLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
  signedIn?: boolean;
}): AppLocale {
  return (
    toSupportedLocale(input.userLocale) ??
    toSupportedLocale(input.cookieLocale) ??
    (input.signedIn ? null : matchAcceptLanguage(input.acceptLanguage)) ??
    routing.defaultLocale
  );
}
