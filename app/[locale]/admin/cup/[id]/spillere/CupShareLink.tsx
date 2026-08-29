'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { ShareLinkField } from '@/components/ui/ShareLinkField';

/**
 * Del-flaten i Spillere-rommet (#1490): den absolutte `/cup/bli-med/[shortId]`-
 * lenken pluss en kopier-knapp. Arrangørens ene utgang — spilleren har
 * `/cup/bli-med/[shortId]` som sin ene inngang (#344, one door per room).
 *
 * Selve felt+kopier-mekanikken bor i den delte `ShareLinkField`-primitiven
 * (#1803); dette skallet eier cup-katalogen og Card-innramminga.
 */
export function CupShareLink({ joinUrl }: { joinUrl: string }) {
  const t = useTranslations('cup.participants.share');

  return (
    <Card>
      <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-1">
        {t('heading')}
      </h2>
      <p className="font-sans text-sm text-muted mb-3">{t('helper')}</p>
      <ShareLinkField
        url={joinUrl}
        ariaLabel={t('ariaLabel')}
        copyLabel={t('copyButton')}
        copiedLabel={t('copiedButton')}
        errorText={t('copyError')}
        testId="cup-share-link"
      />
    </Card>
  );
}
