import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/Card';
import { simSettingGroups } from '@/lib/league/simSettings';
import type { LeagueRoundView } from '@/lib/league/getLigaSnapshot';

/**
 * What the player sets in Trackman before the first stroke (#2666, artboard
 * 9a/9b): course and tee on top, then all eight settings in Trackman's two
 * groups. It lists everything the round uses, not what differs from the
 * league's default: the player has no relation to «standard» (the owner
 * 27.10), so nothing is marked «endret». It does not fold (the league page's
 * `SimSettingsCard` does). The values come from the snapshot's effective
 * settings, so the card never merges default and override itself.
 */
export async function RoundSetupChecklist({
  round,
  locale,
}: {
  round: Pick<LeagueRoundView, 'simSettings' | 'teeName' | 'courseName'>;
  locale: string;
}) {
  const t = await getTranslations('liga.simSettings.checklist');
  const groups = simSettingGroups(round.simSettings, [], locale === 'en' ? 'en' : 'no');
  const where = [
    { key: 'course', label: t('course'), value: round.courseName },
    { key: 'tee', label: t('tee'), value: round.teeName },
  ].filter((row): row is { key: string; label: string; value: string } => row.value !== null);
  return (
    <Card data-testid="round-setup-checklist">
      <h2 className="font-serif text-xl font-medium leading-tight tracking-[-0.015em] text-text [text-wrap:balance]">
        {t('title')}
      </h2>
      <p className="mt-1.5 font-sans text-[13px] leading-[19.5px] text-muted">
        {t('lead')}
      </p>
      {where.length > 0 && (
        <dl className="mt-4 rounded-xl bg-surface-2 px-4 py-3.5" data-testid="round-setup-where">
          {where.map((row, i) => (
            <div
              key={row.key}
              className={`flex items-baseline justify-between gap-3 ${i === 0 ? '' : 'mt-2 border-t border-border pt-2'}`}
              data-testid={`round-setup-${row.key}`}
            >
              <dt className="font-sans text-[10px] leading-[15px] font-semibold uppercase tracking-[0.14em] text-muted">
                {row.label}
              </dt>
              <dd className="min-w-0 text-right font-serif text-[17px] leading-6 text-text">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-5">
        {groups.map((group, gi) => (
          <div key={group.key} className={gi === 0 ? '' : 'mt-4'}>
            <p className="font-sans text-[10px] leading-[15px] font-semibold uppercase tracking-[0.14em] text-muted">
              {group.label}
            </p>
            <dl className="mt-2 space-y-2 font-sans text-[13px] leading-[19.5px]">
              {group.rows.map((row) => (
                <div key={row.key} className="flex justify-between gap-2" data-testid={`round-setup-setting-${row.key}`}>
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="min-w-0 text-right font-medium text-text">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Card>
  );
}
