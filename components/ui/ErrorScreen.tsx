'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from './AppShell';
import { BrandMark } from './BrandMark';
import { ChampagneMedallion } from './ChampagneMedallion';
import { PinFlag } from '@/components/icons/PinFlag';
import { Button, LinkButton } from './Button';

type BackTarget = { href: string; labelKey: 'toGame' | 'toHome' };

/**
 * Delt fallback-skall for rute-error-grensene (#680). Begge `error.tsx`-filene
 * — game-scoped (`games/[id]/error.tsx`) og `[locale]`-catch-all — rendrer
 * denne; de skiller seg bare i hvor «tilbake»-lenken peker. Speiler chromen i
 * `not-found.tsx` (merke + champagne-medaljong) så feil-tilstand og 404 føles
 * som samme familie.
 *
 * NB: rute-grensene gir `unstable_retry` (Next 16.2+), ikke `reset`. Retry
 * re-fetcher og re-rendrer segmentet — riktig respons på en forbigående
 * Supabase-/nett-hikke (en ren `reset` ville ikke kjørt spørringen på nytt).
 */
export function ErrorScreen({
  error,
  retry,
  back,
  context,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  back: BackTarget;
  context: string;
}) {
  const t = useTranslations('error');

  useEffect(() => {
    // Vercel runtime-logg; `digest` matcher server-side stacken.
    console.error(`[${context}]`, error);
  }, [error, context]);

  return (
    <AppShell>
      <BrandMark className="mt-2" />
      <section className="mt-10 flex flex-col items-center text-center">
        <ChampagneMedallion className="mb-7">
          <PinFlag size={72} className="text-primary dark:text-text" />
        </ChampagneMedallion>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] leading-tight text-text">
          {t('heading')}
        </h1>
        <p className="mt-3 max-w-[280px] font-sans text-sm leading-relaxed text-muted">
          {t('body')}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] tracking-tight text-muted/70">
            {t('reference', { digest: error.digest })}
          </p>
        )}
        <div className="mt-8 flex w-full max-w-[280px] flex-col gap-3">
          <Button onClick={retry}>{t('retry')}</Button>
          <LinkButton href={back.href} variant="secondary" full>
            {t(back.labelKey)}
          </LinkButton>
        </div>
      </section>
    </AppShell>
  );
}
