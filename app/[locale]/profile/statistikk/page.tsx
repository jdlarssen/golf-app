import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { nameInitials } from '@/lib/names/initials';
import { getClubStatsAggregate } from '@/lib/stats/getFinishedGameWins';

type PlayerStat = {
  userId: string;
  name: string;
  initials: string;
  count: number;
};

export default async function StatistikkPage() {
  const locale = await getLocale();
  const t = await getTranslations('profile.statistikk');
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login', locale });
  }

  const {
    hasGames,
    winnerCounts,
    participationCounts,
    userNames: userNamesRaw,
  } = await getClubStatsAggregate();

  if (!hasGames) {
    return <EmptyStateView />;
  }

  const unknownPlayer = t('unknownPlayer');
  const userNames = new Map(userNamesRaw);

  const winners = toSortedStats(
    new Map(winnerCounts),
    userNames,
    unknownPlayer,
  ).slice(0, 10);
  const mostActive = toSortedStats(
    new Map(participationCounts),
    userNames,
    unknownPlayer,
  ).slice(0, 10);

  return (
    <AppShell>
      <TopBar
        backHref="/"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
      />

      <h1 className="font-serif text-3xl font-medium tracking-tight text-text leading-tight mb-1">
        {t('heading')}
      </h1>
      <p className="mb-6 font-sans text-sm text-muted">
        {t('subtitle')}
      </p>

      <StatSection
        sectionLabel={t('winnersLabel')}
        heading={t('winnersHeading')}
        subtitle={t('winnersSubtitle')}
        stats={winners}
        unitSingular={t('unitWinSingular')}
        unitPlural={t('unitWinPlural')}
        noDataLabel={t('noData')}
      />

      <div className="mt-8">
        <StatSection
          sectionLabel={t('mostActiveLabel')}
          heading={t('mostActiveHeading')}
          subtitle={t('mostActiveSubtitle')}
          stats={mostActive}
          unitSingular={t('unitGameSingular')}
          unitPlural={t('unitGamePlural')}
          noDataLabel={t('noData')}
        />
      </div>
    </AppShell>
  );
}

async function EmptyStateView() {
  const t = await getTranslations('profile.statistikk');
  return (
    <AppShell>
      <TopBar
        backHref="/"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
      />

      <h1 className="font-serif text-3xl font-medium tracking-tight text-text leading-tight mb-1">
        {t('heading')}
      </h1>
      <p className="mb-6 font-sans text-sm text-muted">
        {t('subtitle')}
      </p>

      <Card>
        <p className="font-sans text-sm text-muted leading-relaxed">
          {t('emptyState')}
        </p>
      </Card>
    </AppShell>
  );
}

function StatSection({
  sectionLabel,
  heading,
  subtitle,
  stats,
  unitSingular,
  unitPlural,
  noDataLabel,
}: {
  sectionLabel: string;
  heading: string;
  subtitle: string;
  stats: PlayerStat[];
  unitSingular: string;
  unitPlural: string;
  noDataLabel: string;
}) {
  return (
    <section className="space-y-3">
      <p className="font-sans text-xs font-semibold text-muted px-1">
        {sectionLabel}
      </p>
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-serif text-base font-medium text-text">
            {heading}
          </h2>
          <p className="font-sans text-sm text-muted mt-0.5">{subtitle}</p>
        </div>

        {stats.length === 0 ? (
          <div className="px-5 pb-5 pt-1">
            <p className="font-sans text-sm text-muted">{noDataLabel}</p>
          </div>
        ) : (
          <ol className="border-t border-border">
            {stats.map((stat, idx) => {
              const rank = idx + 1;
              const isLeader = rank === 1;
              const unit = stat.count === 1 ? unitSingular : unitPlural;
              return (
                <li
                  key={stat.userId}
                  className={`flex items-center gap-3 px-5 py-3 ${
                    idx < stats.length - 1 ? 'border-b border-border' : ''
                  } ${isLeader ? 'bg-accent/[0.06]' : ''}`}
                >
                  {/* Rank number: text-text on leader row for WCAG AA contrast
                      (text-accent ~2.16:1 fails); row tint keeps visual cue). */}
                  <span
                    className={`shrink-0 w-6 font-serif tabular-nums text-[13px] text-right ${
                      isLeader ? 'text-text font-semibold' : 'text-muted'
                    }`}
                  >
                    {rank}
                  </span>
                  {/* Avatar initial: decorative, keeps accent tint. */}
                  <span
                    className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border font-sans text-[12px] font-semibold ${
                      isLeader
                        ? 'border-accent/40 bg-accent/15 text-accent'
                        : 'border-border bg-bg text-text'
                    }`}
                    aria-hidden="true"
                  >
                    {stat.initials}
                  </span>
                  {/* Player name: text-text for AA contrast on leader row. */}
                  <span
                    className={`min-w-0 flex-1 truncate font-serif text-[15px] font-medium ${
                      isLeader ? 'text-text' : 'text-text'
                    }`}
                  >
                    {stat.name}
                  </span>
                  {/* Count: text-text for AA contrast on leader row. */}
                  <span
                    className={`shrink-0 font-sans tabular-nums text-sm ${
                      isLeader ? 'text-text font-semibold' : 'text-muted'
                    }`}
                  >
                    {stat.count}{' '}
                    <span className="text-xs">{unit}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </section>
  );
}


function toSortedStats(
  counts: Map<string, number>,
  userNames: Map<string, string>,
  unknownFallback: string,
): PlayerStat[] {
  const entries: PlayerStat[] = [];
  for (const [userId, count] of counts.entries()) {
    if (count <= 0) continue;
    const name = userNames.get(userId) ?? unknownFallback;
    entries.push({
      userId,
      name,
      initials: nameInitials(name),
      count,
    });
  }
  // Sort by count desc, then name asc for stable ordering on ties.
  entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'nb'));
  return entries;
}
