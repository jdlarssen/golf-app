import { getTranslations } from 'next-intl/server';
import { SimSettingsCard } from './SimSettingsCard';
import { simSettingGroups } from '@/lib/league/simSettings';
import type { LeagueRoundView } from '@/lib/league/getLigaSnapshot';

/**
 * The folded settings card for one round of a simulator league (#2638,
 * artboard 7a), on the league page: the round's effective settings from the
 * snapshot, its tee from the course selection. The round start shows the full
 * checklist instead (`RoundSetupChecklist`, #2666). Neither marks what the
 * organiser changed: that stays on the organiser's page.
 */
export async function RoundSimSettingsCard({
  round,
  locale,
}: {
  round: Pick<LeagueRoundView, 'simSettings' | 'teeName'>;
  locale: string;
}) {
  const t = await getTranslations('liga.simSettings');
  return (
    <SimSettingsCard
      summary={t('summary')}
      defaultOpen={false}
      groups={simSettingGroups(round.simSettings, [], locale === 'en' ? 'en' : 'no')}
      tee={round.teeName ? { label: t('tee'), value: round.teeName } : null}
    />
  );
}
