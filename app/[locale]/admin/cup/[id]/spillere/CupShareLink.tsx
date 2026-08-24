'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';

/**
 * Del-flaten i Spillere-rommet (#1490): den absolutte `/cup/bli-med/[shortId]`-
 * lenken pluss en kopier-knapp. Arrangørens ene utgang — spilleren har
 * `/cup/bli-med/[shortId]` som sin ene inngang (#344, one door per room).
 *
 * Speiler `CopyJoinLinkButton` i klubb-detaljen. Egen kopi framfor gjenbruk
 * fordi den er hardkodet til `klubb.copyLink`-katalogen; å parametrisere
 * namespacet ville gjort en klubb-komponent til en delt primitiv uten at noen
 * har bedt om det. Blir dette en tredje kopi med samme innhold, hører den
 * hjemme i `components/ui/`.
 */
export function CupShareLink({ joinUrl }: { joinUrl: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const t = useTranslations('cup.participants.share');

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setState('copied');
      window.setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      console.error('[CupShareLink] copy failed', err);
      setState('error');
    }
  }

  return (
    <Card>
      <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-1">
        {t('heading')}
      </h2>
      <p className="font-sans text-sm text-muted mb-3">{t('helper')}</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={joinUrl}
          onFocus={(e) => e.currentTarget.select()}
          data-testid="cup-share-link"
          className="flex-1 min-w-0 rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-[12px] tabular-nums text-text"
          aria-label={t('ariaLabel')}
        />
        <button
          type="button"
          onClick={copy}
          data-testid="cup-share-link-copy"
          className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-medium tracking-tight text-white transition-colors hover:bg-primary-hover dark:text-bg"
        >
          {state === 'copied' ? t('copiedButton') : t('copyButton')}
        </button>
      </div>
      {state === 'error' && (
        <p className="mt-2 text-xs text-danger">{t('copyError')}</p>
      )}
    </Card>
  );
}
