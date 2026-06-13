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
import noMessages from '@/messages/no.json';
import enMessages from '@/messages/en.json';
import { routing, type AppLocale } from '@/i18n/routing';
import { toSupportedLocale } from '@/lib/i18n/resolveLocale';

/** The catalog shape — the default-locale catalog is the canonical structure. */
type MailCatalog = typeof noMessages;
type AnyRecord = Record<string, unknown>;

// Only locales with a shipped mail catalog are handled. Everything else — null,
// an unknown string, or `gd`/`ga` before Phase G lands their catalogs — falls
// back to the default locale, never a raw key or empty mail. Forward-compatible:
// Phase G adds its catalogs to this map and nothing else changes.
const CATALOGS: Partial<Record<AppLocale, MailCatalog>> = {
  no: noMessages,
  en: enMessages,
};

// Merge the requested locale ON TOP of the default catalog, so a key missing in
// e.g. `en` renders the `no` string. Mirror of the fallback merge in
// `i18n/request.ts` — kept local so mail has no dependency on request internals.
function deepMerge(base: AnyRecord, overlay: AnyRecord): AnyRecord {
  const out: AnyRecord = { ...base };
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
      out[key] = deepMerge(existing as AnyRecord, value as AnyRecord);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Narrow a recipient's stored locale (or anything) to a supported one, default `no`. */
export function resolveMailLocale(locale: string | null | undefined): AppLocale {
  return toSupportedLocale(locale) ?? routing.defaultLocale;
}

/**
 * The merged catalog for a recipient's locale. Use for dynamic, runtime-keyed
 * lookups (`formatGuide.content[gameMode]`, `modes[gameMode]`) that don't fit a
 * typed `t('key')`. Static mail strings should go through `getMailTranslator`.
 */
export function getMailMessages(locale: string | null | undefined): MailCatalog {
  const loc = resolveMailLocale(locale);
  if (loc === routing.defaultLocale) return noMessages;
  const overlay = CATALOGS[loc];
  return overlay
    ? (deepMerge(noMessages as AnyRecord, overlay as AnyRecord) as MailCatalog)
    : noMessages;
}

/**
 * A translator scoped to the `mail` namespace for a recipient's locale.
 * `getMailTranslator('en')('invite.subject', { name })` renders the English
 * `mail.invite.subject` with the same ICU semantics the app uses.
 *
 * `timeZone` is pinned so date interpolation doesn't bake in the server's zone.
 */
export function getMailTranslator(locale: string | null | undefined) {
  const loc = resolveMailLocale(locale);
  return createTranslator({
    locale: loc,
    messages: getMailMessages(loc),
    namespace: 'mail',
    timeZone: 'Europe/Oslo',
  });
}

export type MailTranslator = ReturnType<typeof getMailTranslator>;

const APP_BASE_URL = 'https://tornygolf.no';

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
