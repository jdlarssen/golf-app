'use client';

import { useTranslations } from 'next-intl';
import { formatLineupText, type FormatLineup as Lineup } from '@/lib/wizard/formatLineup';
import { FormatLineupFigure } from '@/components/FormatLineupFigure';

/** The dot figure (#2260) with «mot» from the wizard's messages. */
export function FormatLineup({
  lineup,
  variant,
}: {
  lineup: Lineup;
  variant: 'card' | 'row';
}) {
  const t = useTranslations('wizard.formatGrid.lineup');
  return <FormatLineupFigure lineup={lineup} variant={variant} versusLabel={t('versus')} />;
}

/**
 * The line-up as text: «2 mot 2», «3 lag à 2», «2 eller 4 per lag». The
 * format cards' line (#2260) and the line for a format with one team size
 * (#2453) read it, so the two always say the same. The wording itself is
 * `formatLineupText`, which the format helper on /spillformater reads on the
 * server (#2328).
 */
export function useLineupText(): (lineup: Lineup) => string {
  const t = useTranslations('wizard.formatGrid.lineup');
  return (lineup) => formatLineupText((key, values) => t(key, values), lineup);
}
