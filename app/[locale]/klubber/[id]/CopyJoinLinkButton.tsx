'use client';

import { useTranslations } from 'next-intl';
import { ShareLinkField } from '@/components/ui/ShareLinkField';

/**
 * «Kopier lenke»-flaten på klubb-detaljsiden: den absolutte
 * /klubber/bli-med/[short_id]-lenken. Selve felt+kopier-mekanikken bor i den
 * delte `ShareLinkField`-primitiven (#1803); dette skallet eier
 * klubb-katalogen.
 *
 * Part of #442 (Opprett klubb — eierskap + klubb-scoped oppdagbarhet).
 */
export function CopyJoinLinkButton({ joinUrl }: { joinUrl: string }) {
  const t = useTranslations('klubb.copyLink');

  return (
    <ShareLinkField
      url={joinUrl}
      ariaLabel={t('ariaLabel')}
      copyLabel={t('copyButton')}
      copiedLabel={t('copiedButton')}
      errorText={t('copyError')}
    />
  );
}
