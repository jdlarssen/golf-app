'use server';

import { cookies } from 'next/headers';
import { routing, type AppLocale } from '@/i18n/routing';
import { redirect } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';

const LOCALE_COOKIE = 'NEXT_LOCALE';
// Mirror values from proxy.ts exactly.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Server action: switch the active locale.
 *
 * 1. Validates the requested locale against routing.locales (silently falls
 *    back to the default locale for unknown values — public action).
 * 2. Sets the NEXT_LOCALE cookie (1 year, sameSite lax, path /).
 * 3. If a Supabase session exists, updates users.locale for same-device
 *    persistence and cross-device sync via the proxy negotiation chain.
 *    No session → cookie-only (pre-auth switch).
 * 4. Redirects to the locale-correct version of the same pathname+search via
 *    i18n/navigation redirect so `as-needed` prefixing is applied correctly
 *    (/en/login ↔ /login, never /no/login).
 */
export async function setLocale(formData: FormData): Promise<void> {
  const requestedLocale = String(formData.get('locale') ?? '').trim();
  const pathname = String(formData.get('pathname') ?? '/').trim();
  const search = String(formData.get('search') ?? '').trim();

  // Validate — silently fall back to default for unknown values.
  const locale: AppLocale = routing.locales.includes(
    requestedLocale as AppLocale,
  )
    ? (requestedLocale as AppLocale)
    : routing.defaultLocale;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: COOKIE_MAX_AGE,
    sameSite: 'lax',
  });

  // Best-effort DB update — skip silently when there's no session.
  try {
    const supabase = await getServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from('users')
        .update({ locale })
        .eq('id', user.id);
      if (error) {
        console.error('[setLocale] users.locale update failed', error);
      }
    }
  } catch (err) {
    console.error('[setLocale] DB update threw', err);
  }

  // Redirect to the locale-correct version of the current page.
  const href = pathname + search;
  redirect({ href, locale });
}
