'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';

/** «Skriv ut»-knapp for plakaten (#1022) — skjules selv i utskriften. */
export function PrintButton() {
  const t = useTranslations('signup.public');
  return (
    <div className="print:hidden">
      <Button type="button" className="w-full" onClick={() => window.print()}>
        {t('posterPrintButton')}
      </Button>
    </div>
  );
}
