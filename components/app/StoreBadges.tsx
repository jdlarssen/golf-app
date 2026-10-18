'use client';

import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { STORE_URLS, type Store } from '@/lib/app/storeLinks';

/**
 * The official store badges, unchanged (#2562). Apple's are SVG from its
 * marketing toolbox (`no-no`: «Last ned fra App Store»); Google publishes its
 * badge as PNG only, with the transparent margin trimmed off so both badges
 * draw at the same 40 px height, the stores' minimum. Width is each file's
 * own ratio at that height.
 */
const BADGES: Record<
  Store,
  { src: Record<'no' | 'en', string>; width: Record<'no' | 'en', number> }
> = {
  appStore: {
    src: { no: '/badges/app-store-no.svg', en: '/badges/app-store-en.svg' },
    width: { no: 120, en: 120 },
  },
  googlePlay: {
    src: { no: '/badges/google-play-no.png', en: '/badges/google-play-en.png' },
    width: { no: 135, en: 134 },
  },
};

/**
 * A row of store badge links. Each link opens the store in the same tab, has
 * an `aria-label` («Hent Tørny i App Store») and a tap target of at least
 * 44 px. The black badges carry the stores' own grey frame, which is what
 * keeps them visible on the dark theme.
 */
export function StoreBadges({
  stores,
  className = '',
}: {
  stores: Store[];
  className?: string;
}) {
  const t = useTranslations('getTheApp');
  const locale = useLocale() === 'en' ? 'en' : 'no';
  return (
    <div className={`flex flex-wrap items-center gap-x-3 ${className}`}>
      {stores.map((store) => (
        <a
          key={store}
          href={STORE_URLS[store]}
          aria-label={t(store === 'appStore' ? 'appStoreAria' : 'googlePlayAria')}
          data-testid={`store-badge-${store}`}
          className="inline-flex min-h-11 items-center"
        >
          <Image
            src={BADGES[store].src[locale]}
            alt=""
            width={BADGES[store].width[locale]}
            height={40}
            unoptimized
            className="h-10 w-auto"
          />
        </a>
      ))}
    </div>
  );
}
