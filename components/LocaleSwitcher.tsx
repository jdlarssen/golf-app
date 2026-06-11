'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { setLocale } from '@/lib/i18n/localeActions';
import { useLocale } from 'next-intl';

/**
 * Segmented Norsk / English control. Submits the setLocale server action
 * which sets the NEXT_LOCALE cookie and redirects to the locale-correct
 * version of the current page (preserving all search params).
 *
 * Used on the login page (pre-auth) and the Profil SettingList (post-auth).
 * Tap targets are min 44 px per design guidelines.
 */
export function LocaleSwitcher() {
  const t = useTranslations('localeSwitcher');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = useLocale();

  const search = searchParams.toString() ? `?${searchParams.toString()}` : '';

  return (
    <form action={setLocale} data-testid="locale-switcher">
      <input type="hidden" name="pathname" value={pathname} />
      <input type="hidden" name="search" value={search} />
      <div className="inline-flex overflow-hidden rounded-full border border-border bg-surface shadow-sm">
        {routing.locales.map((locale) => {
          const isActive = locale === currentLocale;
          return (
            <button
              key={locale}
              type="submit"
              name="locale"
              value={locale}
              data-testid={`locale-option-${locale}`}
              aria-pressed={isActive}
              className={`flex min-h-[44px] min-w-[72px] items-center justify-center px-4 font-sans text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 first:rounded-l-full last:rounded-r-full ${
                isActive
                  ? 'bg-primary text-bg'
                  : 'text-muted hover:bg-primary-soft/60 hover:text-text'
              }`}
            >
              {t(locale)}
            </button>
          );
        })}
      </div>
    </form>
  );
}
