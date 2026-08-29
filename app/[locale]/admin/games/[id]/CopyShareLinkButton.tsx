'use client';

import { useTranslations } from 'next-intl';
import { ShareLinkField } from '@/components/ui/ShareLinkField';

/**
 * «Kopier lenke»-flaten i Påmelding-seksjonen (#199): den absolutte
 * signup-lenken for spillet. Selve felt+kopier-mekanikken bor i den delte
 * `ShareLinkField`-primitiven (#1803); dette skallet eier admin-katalogen.
 */
export function CopyShareLinkButton({ shareUrl }: { shareUrl: string }) {
  const t = useTranslations('admin.game.registration');

  return (
    <ShareLinkField
      url={shareUrl}
      ariaLabel={t('shareUrlAriaLabel')}
      copyLabel={t('copyButton')}
      copiedLabel={t('copiedButton')}
      errorText={t('copyFailure')}
    />
  );
}
