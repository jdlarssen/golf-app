'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { sponsorLogoUrl } from '@/lib/storage/sponsorLogoUrl';

/**
 * #1052: sponsor-krediteringen under en premie-linje. Slott med logo viser
 * logoen (sponsornavnet blir alt-tekst — eier-beslutning 2026-07-15), slott
 * med bare navn beholder «Sponset av {navn}». Ett hjem for begge kortene
 * (PremiebordCard + PrizeAwardsCard) så visningsregelen aldri drifter.
 */
export function SponsorCredit({
  sponsor,
  sponsorLogoPath,
}: {
  sponsor: string | null;
  sponsorLogoPath: string | null;
}) {
  const t = useTranslations('prizes');

  if (sponsorLogoPath) {
    return (
      <Image
        src={sponsorLogoUrl(sponsorLogoPath)}
        alt={sponsor?.trim() || t('logoAlt')}
        width={96}
        height={20}
        unoptimized
        // Mørke logoer trenger lys bakplate i dark mode.
        className="mt-1 h-5 w-auto max-w-24 object-contain dark:rounded-sm dark:bg-white/90 dark:p-0.5"
      />
    );
  }
  if (sponsor) {
    return (
      <p className="mt-0.5 text-xs text-muted">
        {t('sponsoredBy', { sponsor })}
      </p>
    );
  }
  return null;
}
