import { getTranslations } from 'next-intl/server';
import { SimSettingsCard } from './SimSettingsCard';
import { simSettingGroups } from '@/lib/league/simSettings';
import type { LeagueRoundView } from '@/lib/league/getLigaSnapshot';

/**
 * The settings card for one round of a simulator league (#2638, artboards
 * 7a/7b), shared by the league page and the round start: the round's
 * effective settings from the snapshot, its tee from the course selection.
 */
export async function RoundSimSettingsCard({
  round,
  locale,
}: {
  round: Pick<LeagueRoundView, 'label' | 'simSettings' | 'overriddenKeys' | 'teeName'>;
  locale: string;
}) {
  const t = await getTranslations('liga.simSettings');
  return (
    <SimSettingsCard
      heading={t('heading', { round: round.label })}
      groups={simSettingGroups(round.simSettings, round.overriddenKeys, locale === 'en' ? 'en' : 'no')}
      overriddenLabel={t('overridden')}
      tee={round.teeName ? { label: t('tee'), value: round.teeName } : null}
    />
  );
}
