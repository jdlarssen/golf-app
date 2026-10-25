import { getTranslations } from 'next-intl/server';
import { SimSettingsCard } from './SimSettingsCard';
import { simSettingGroups } from '@/lib/league/simSettings';
import type { LeagueRoundView } from '@/lib/league/getLigaSnapshot';

/**
 * The settings card for one round of a simulator league (#2638, artboards
 * 7a/7b), shared by the league page and the round start: the round's
 * effective settings from the snapshot, its tee from the course selection.
 * Folded on the league page; `defaultOpen` on the round start, where the
 * player sets up the simulator.
 */
export async function RoundSimSettingsCard({
  round,
  locale,
  defaultOpen = false,
}: {
  round: Pick<LeagueRoundView, 'simSettings' | 'overriddenKeys' | 'teeName'>;
  locale: string;
  defaultOpen?: boolean;
}) {
  const t = await getTranslations('liga.simSettings');
  return (
    <SimSettingsCard
      summary={t('summary')}
      defaultOpen={defaultOpen}
      groups={simSettingGroups(round.simSettings, round.overriddenKeys, locale === 'en' ? 'en' : 'no')}
      overriddenLabel={t('overridden')}
      tee={round.teeName ? { label: t('tee'), value: round.teeName } : null}
    />
  );
}
