'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Banner } from '@/components/ui/Banner';
import { buttonClasses } from '@/components/ui/Button';
import { useStorePlatform } from '@/hooks/useStorePlatform';
import { openInAppHref, openInAppView } from '@/lib/appLinks/openInApp';
import { isStandalone } from '@/lib/pwa/detect';
import { GetTheApp } from './GetTheApp';

// The host and the display mode do not change while the page is open. The server
// snapshots keep the first render empty, and the button comes after hydration
// (the `useStorePlatform` pattern).
const subscribe = () => () => {};
const currentHost = () => window.location.host;
const noHost = () => '';
const notStandalone = () => false;

/**
 * «Åpne i appen» and the notice that follows if it did not (#2748). The rules are
 * `lib/appLinks/openInApp.ts`. A plain `<a>`, because an app link needs a real tap
 * on a real link. Renders nothing at all when neither applies.
 *
 * @param path the path from `appLinkPaths.ts`, without locale
 */
export function OpenInAppButton({
  path,
  locale,
  fromLink,
  noApp,
  className = '',
}: {
  path: string;
  locale: string;
  fromLink: boolean;
  noApp: boolean;
  className?: string;
}) {
  const t = useTranslations('openInApp');
  const platform = useStorePlatform();
  const standalone = useSyncExternalStore(subscribe, isStandalone, notStandalone);
  const host = useSyncExternalStore(subscribe, currentHost, noHost);

  const href = openInAppHref(path, host, locale);
  const view = openInAppView({ platform, standalone, fromLink, noApp });
  if (!view.notice && !(view.button && href)) return null;

  return (
    <div data-testid="open-in-app" className={`space-y-3 ${className}`}>
      {view.notice && <Banner tone="info" testId="open-in-app-notice">{t('notice')}</Banner>}
      {view.notice && <GetTheApp variant="badges" deviceOnly />}
      {view.button && href && (
        <a
          href={href}
          data-testid="open-in-app-button"
          className={`${buttonClasses('secondary', 'default')} w-full`}
        >
          {t('button')}
        </a>
      )}
    </div>
  );
}
