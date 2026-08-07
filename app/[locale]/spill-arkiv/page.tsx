import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { AppShell } from '@/components/ui/AppShell';
import { BackLink } from '@/components/ui/BackLink';
import { Kicker } from '@/components/ui/Kicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getFinishedGamesForUser } from '@/lib/games/getFinishedGamesForUser';
import { toFinishedEntries } from '@/lib/games/finishedEntries';
import { groupFinishedByMonth } from '@/lib/games/groupFinishedByMonth';
import { FinishedGameCard } from '@/components/games/FinishedGameCard';
import { FinishedCupDayCard } from '@/components/games/FinishedCupDayCard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home');
  return { title: t('archiveMetaTitle') };
}

/**
 * Spill-arkiv (#571): hele historikken av avsluttede spill, gruppert per måned
 * (nyeste først). Hjem viser bare de siste 5 + en «Vis alle»-lenke hit, så
 * hjem-siden holder seg som play + discover-navet og ikke vokser uten grense.
 *
 * Auth-gates som resten av app-en (leser cookies/headers → ruta er dynamisk
 * under cacheComponents, så ingen force-dynamic trengs — samme som Hjem).
 */
export default async function SpillArkivPage() {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('home');

  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login?next=/spill-arkiv', locale });
  }

  const supabase = await getServerClient();
  const finishedGames = await getFinishedGamesForUser(supabase, userId!);
  // #1449: fold split cup days into one cup entry before grouping by month.
  const entries = toFinishedEntries(finishedGames);
  const groups = groupFinishedByMonth(entries, locale, t('archiveNoDate'));

  return (
    <AppShell>
      <header className="mb-2 flex items-center justify-between gap-4">
        <BackLink href="/">{t('archiveBackHome')}</BackLink>
        <Kicker tone="accent">{t('archiveKicker')}</Kicker>
        <span className="w-12" aria-hidden />
      </header>

      <PageHeader
        title={t('archiveTitle')}
        subtitle={entries.length > 0 ? t('archiveSubtitle') : undefined}
      />

      {groups.length === 0 ? (
        <p className="mt-4 font-sans text-sm leading-relaxed text-muted">
          {t('archiveEmpty')}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-3 flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  {group.label}
                </p>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-3">
                {group.games.map((entry) =>
                  entry.kind === 'cupDay' ? (
                    <FinishedCupDayCard key={entry.tournamentId} entry={entry} />
                  ) : (
                    <FinishedGameCard key={entry.game.id} game={entry.game} />
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
