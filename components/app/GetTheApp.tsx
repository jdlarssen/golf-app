'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { appLaunchFlag, storesFor } from '@/lib/app/appLaunch';
import { useStorePlatform } from '@/hooks/useStorePlatform';
import { StoreBadges } from './StoreBadges';

/**
 * «Hent appen» on the website (#2562). Renders nothing while
 * `NEXT_PUBLIC_APP_LAUNCH` is `off`, and nothing where no store fits the
 * device (an Android phone while only the App Store is out).
 *
 * The server and the first render show every store that is out; after
 * hydration an iPhone keeps the App Store and an Android phone Google Play
 * (`useStorePlatform`, no hydration mismatch).
 *
 * - `card`: the confirmations (game page before start, sign-up) and `/demo`.
 * - `inline`: one quiet line with the badges, for the live board.
 * - `badges`: the badges alone, for the `/demo` page that points to the app.
 * - `deviceOnly`: only on a phone or tablet whose store is out. `/demo` uses
 *   it with `ios`, where the demo stays and an iPhone gets the card above it.
 */
export function GetTheApp({
  variant = 'card',
  deviceOnly = false,
  className = '',
}: {
  variant?: 'card' | 'inline' | 'badges';
  deviceOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations('getTheApp');
  const headingId = useId();
  const platform = useStorePlatform();

  if (deviceOnly && (platform === 'unknown' || platform === 'other')) {
    return null;
  }
  const stores = storesFor(appLaunchFlag(), platform);
  if (stores.length === 0) return null;

  if (variant === 'badges') {
    return (
      <div data-testid="get-the-app" className={className}>
        <StoreBadges stores={stores} />
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div
        data-testid="get-the-app"
        className={`flex flex-col items-center gap-1.5 text-center ${className}`}
      >
        <p className="text-[13px] leading-snug text-muted">{t('inline')}</p>
        <StoreBadges stores={stores} className="justify-center" />
      </div>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      data-testid="get-the-app"
      className={`rounded-2xl border border-border bg-surface px-4 py-3.5 ${className}`}
    >
      <h2
        id={headingId}
        className="font-serif text-[17px] leading-snug font-medium text-text"
      >
        {t('title')}
      </h2>
      <p className="mt-1 text-[14px] leading-relaxed text-muted">{t('body')}</p>
      <StoreBadges stores={stores} className="mt-2" />
    </section>
  );
}
