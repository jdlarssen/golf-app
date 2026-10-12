'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AppShell } from './AppShell';
import { Button, LinkButton } from './Button';
import { MishapView } from '@/components/MishapView';
import { TreeScene } from '@/components/illustrations/HoleScene';

type BackTarget = { href: string; labelKey: 'toGame' | 'toHome' | 'toProfile' };

/**
 * Delt fallback-skall for rute-error-grensene (#680). Alle `error.tsx`-filene
 * — game-scoped (`games/[id]/error.tsx`), profil-scoped (`profile/error.tsx`)
 * og `[locale]`-catch-all — rendrer denne; de skiller seg bare i hvor
 * «tilbake»-lenken peker. Feilskjermen og 404 deler oppsettet i `MishapView`,
 * så de er samme familie; her ligger ballen ved et tre (`TreeScene`, #2287).
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
    <AppShell flush>
      <div data-testid="error-screen">
        <MishapView
          scene={<TreeScene className="mt-6" />}
          heading={t('heading')}
          body={t('body')}
          note={
            error.digest && (
              <p className="font-mono text-[11px] tracking-tight text-muted">
                {t('reference', { digest: error.digest })}
              </p>
            )
          }
        >
          <Button size="large" className="w-full leading-[normal]" onClick={retry}>
            {t('retry')}
          </Button>
          <LinkButton
            href={back.href}
            variant="quiet"
            size="tall"
            className="w-full border border-border"
          >
            {t(back.labelKey)}
          </LinkButton>
        </MishapView>
      </div>
    </AppShell>
  );
}
