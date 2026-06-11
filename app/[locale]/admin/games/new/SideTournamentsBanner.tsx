'use client';

import { useTranslations } from 'next-intl';

/**
 * Liten hint-banner som vises nederst i wizard step 2 (Format-velgeren) for
 * alle intents. Signaliserer at sideturneringer kommer som eget steg i Klar-
 * disclosure-en — admin trenger ikke bekymre seg for det her.
 */
export function SideTournamentsBanner() {
  const t = useTranslations('wizard.sideTournaments');
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
      <p>
        <span aria-hidden className="mr-1">
          💡
        </span>
        {t('banner')}
      </p>
    </div>
  );
}
