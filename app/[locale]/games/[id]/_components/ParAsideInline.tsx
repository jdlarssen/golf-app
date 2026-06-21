import { useTranslations } from 'next-intl';

import { hasParDifference, type HoleParByGender } from '@/lib/games/parDisplay';
import type { ScoringGender } from '@/lib/scoring/modes/types';

/**
 * Liten avvik-indikator vist etter par-tallet i scorekort-relaterte tabeller
 * (scorekort, «DITT KORT»-preview og godkjenning). Vises bare når `parByGender`
 * har avvik mellom kjønn. `playerGender` er scorekort-eierens kjønn (ikke
 * seerens) — eierens eget kjønn ekskluderes fra tooltipen. Title-attributtet
 * gir tooltip på desktop og long-press på iOS. #240/#252.
 */
export function ParAsideInline({
  parByGender,
  playerGender,
}: {
  parByGender: HoleParByGender;
  playerGender: ScoringGender;
}) {
  const t = useTranslations('scorecard');
  if (!hasParDifference(parByGender)) return null;
  const parts: string[] = [];
  if (playerGender !== 'mens') parts.push(t('parGenderMens', { par: parByGender.mens }));
  if (playerGender !== 'ladies') parts.push(t('parGenderLadies', { par: parByGender.ladies }));
  if (playerGender !== 'juniors') parts.push(t('parGenderJuniors', { par: parByGender.juniors }));
  const tooltip = t('parAsideTooltip', { genders: parts.join(', ') });
  return (
    <sup
      data-testid="par-aside-marker"
      title={tooltip}
      aria-label={tooltip}
      className="ml-0.5 cursor-help text-[0.65em] font-semibold text-muted"
    >
      *
    </sup>
  );
}
