// Locale-aware string rendering for transactional mail (i18n Fase M, #594).
//
// Mail renders for the RECIPIENT's locale (their `users.locale`), which is NOT
// the request locale. So the request-scoped `getTranslations()`/`useTranslations()`
// can't be used here — we must load the catalog explicitly and pick the locale
// per recipient. next-intl's `createTranslator()` does exactly that and gives the
// same ICU formatting (plurals, interpolation) as the rest of the app.
//
// HTML structure stays in the mail modules; only user-visible text lives in the
// `mail.*` namespace of the catalog. Dynamic lookups (a format's summary, a mode
// label) read the raw merged messages via `getMailMessages` — keyed by runtime
// `game_mode`, those don't fit next-intl's statically-typed `t('key')`.

import { createTranslator } from 'next-intl';
import { routing, type AppLocale } from '@/i18n/routing';
import { loadMessages, type Catalog } from '@/lib/i18n/messages';
import { toSupportedLocale } from '@/lib/i18n/resolveLocale';

/** The catalog shape — the default-locale catalog is the canonical structure. */
type MailCatalog = Catalog;

/** Narrow a recipient's stored locale (or anything) to a supported one, default `no`. */
export function resolveMailLocale(locale: string | null | undefined): AppLocale {
  return toSupportedLocale(locale) ?? routing.defaultLocale;
}

/**
 * The merged catalog for a recipient's locale. Use for dynamic, runtime-keyed
 * lookups (`formatGuide.content[gameMode]`, `modes[gameMode]`) that don't fit a
 * typed `t('key')`. Static mail strings should go through `getMailTranslator`.
 *
 * Loaded through `loadMessages` (`lib/i18n/messages.ts`), the same loader the
 * app uses, so a new `messages/<code>.json` is picked up with no edit here (the
 * N-locale criterion, #845). A locale whose catalog file is missing falls back
 * to the default, never a raw key or empty mail.
 */
export async function getMailMessages(
  locale: string | null | undefined,
): Promise<MailCatalog> {
  return loadMessages(resolveMailLocale(locale));
}

/**
 * A translator scoped to the `mail` namespace for a recipient's locale.
 * `(await getMailTranslator('en'))('invite.subject', { name })` renders the
 * English `mail.invite.subject` with the same ICU semantics the app uses.
 *
 * `timeZone` is pinned so date interpolation doesn't bake in the server's zone.
 */
export async function getMailTranslator(locale: string | null | undefined) {
  const loc = resolveMailLocale(locale);
  return createTranslator({
    locale: loc,
    messages: await getMailMessages(loc),
    namespace: 'mail',
    timeZone: 'Europe/Oslo',
  });
}

export type MailTranslator = Awaited<ReturnType<typeof getMailTranslator>>;

/** The app's public origin — the root of every absolute URL a mail carries. */
export const APP_BASE_URL = 'https://tornygolf.no';

/**
 * A locale-correct absolute app URL for mail links. Route segments stay
 * Norwegian for every locale (epic #60), but `localePrefix: 'as-needed'` serves
 * non-default locales under a prefix — so an `en` recipient must land on
 * `/en/login`, not `/login` (which would render Norwegian). `path` starts with `/`.
 */
export function mailUrl(locale: string | null | undefined, path: string): string {
  const loc = resolveMailLocale(locale);
  const prefix = loc === routing.defaultLocale ? '' : `/${loc}`;
  return `${APP_BASE_URL}${prefix}${path}`;
}
