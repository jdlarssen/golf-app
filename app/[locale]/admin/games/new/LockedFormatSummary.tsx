'use client';

import { useTranslations } from 'next-intl';
import type { GameMode } from '@/lib/scoring/modes/types';

/**
 * LockedFormatSummary — read-only sammendragskort for spillform når modusen er
 * låst (edit av et publisert/scheduled spill). Erstatter den fulle ModeSelector-
 * griden (13 kort) + TeamSizeSelector, som ellers bare vises nedtonet og ikke
 * kan endres etter publisering (#909). Allowance- og setup-feltene rendres
 * fortsatt under kortet (urørt), så de detaljerte verdiene er fremdeles synlige.
 *
 * Rent presentasjons — emitter ingen skjema-felter. `game_mode`/`team_size`
 * sendes via de skjulte input-ene øverst i GameForm, så å droppe selve
 * velgerne her endrer ikke form-data.
 */
export function LockedFormatSummary({
  mode,
  teamSize,
  showTeamSize,
}: {
  mode: GameMode;
  teamSize: number;
  /** Vis lagstørrelse-linja (kun lag-formater; skjules for solo/matchplay 1v1). */
  showTeamSize: boolean;
}) {
  const tModes = useTranslations('modes');
  const t = useTranslations('wizard.form');
  return (
    <div className="space-y-1 rounded-xl border border-border bg-surface-2 p-3">
      <p className="font-serif text-base text-text">{tModes(mode)}</p>
      {showTeamSize && (
        <p className="text-xs text-muted tabular-nums">
          {t('lockedTeamSize', { size: teamSize })}
        </p>
      )}
      <p className="text-xs text-muted">
        <strong>{t('modeLockedNote')}</strong>
      </p>
    </div>
  );
}
