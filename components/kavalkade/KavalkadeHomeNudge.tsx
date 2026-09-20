'use client';

import { useTranslations } from 'next-intl';
import { SmartLink } from '@/components/ui/SmartLink';
import type { KavalkadeHomeSlot } from '@/lib/kavalkade/release';

/**
 * Kavalkaden på forsiden (#2131, epic #1040) — to tekster, ett banner.
 *
 * `teaser` (1.–23. desember) bygger forventning og lenker ingen steder: siden
 * er stengt, og en lenke inn i «kommer 24. desember» er en blindvei. `link`
 * (24. desember–31. januar) er selve døra inn i kortstokken.
 *
 * Hvem som ser det og når, avgjøres på serveren (`HomeNudges`); her er det bare
 * to tilstander og en lenke. Banneret kan ikke lukkes: vinduet lukker seg selv
 * etter noen uker, og det er den eneste flata som peker spillerne mot
 * Kavalkaden i romjula.
 */
export function KavalkadeHomeNudge({
  slot,
  year,
}: {
  slot: KavalkadeHomeSlot;
  year: number;
}) {
  const t = useTranslations('kavalkade');
  const isTeaser = slot === 'teaser';

  return (
    <div
      data-testid="kavalkade-home-nudge"
      data-slot={slot}
      className="relative mb-4 overflow-hidden rounded-xl border border-border bg-surface px-4 py-3 pl-5"
    >
      <span
        aria-hidden
        className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full"
        style={{ background: 'var(--accent)' }}
      />
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-lg leading-none">
          🎄
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[14px] font-medium leading-tight text-text">
            {isTeaser ? t('homeTeaserTitle') : t('homeLinkTitle', { year })}
          </p>
          <p className="mt-1 font-sans text-[13px] leading-snug text-muted">
            {isTeaser ? t('homeTeaserBody') : t('homeLinkBody')}
          </p>
          {!isTeaser && (
            <div className="mt-2">
              <SmartLink
                href={`/kavalkade/${year}`}
                data-testid="kavalkade-home-nudge-cta"
                className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 py-2 font-sans text-[13px] font-medium text-bg transition-colors hover:bg-primary/90"
              >
                {t('homeLinkCta')}
              </SmartLink>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
