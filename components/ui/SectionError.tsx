'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from './Button';

/**
 * A section whose read failed (#2490). Says so and offers «Prøv igjen»
 * instead of the empty state, which would tell the user there is nothing
 * there. The retry re-renders the server components (`router.refresh()`), so
 * only the failed reads run again; the rest of the page stays put.
 */
export function SectionError({ testId = 'section-error' }: { testId?: string }) {
  const t = useTranslations('error');
  const router = useRouter();
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/[0.08] px-4 py-3"
    >
      <p className="text-sm font-medium tracking-tight text-danger">
        {t('sectionBody')}
      </p>
      <Button
        type="button"
        size="chip"
        variant="secondary"
        onClick={() => router.refresh()}
      >
        {t('retry')}
      </Button>
    </div>
  );
}
