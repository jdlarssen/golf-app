import { getTranslations, getLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { formatShortDateLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';


type SearchParams = Promise<{
  status?: string | string[];
}>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const STATUS_TO_CHIP: Record<'draft' | 'active' | 'finished', StatusChipTone> = {
  draft: 'utkast',
  active: 'aktiv',
  finished: 'signert',
};

export default async function LigaListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const statusCode = first(sp.status);

  const supabase = await getServerClient();
  await requireAdmin(supabase);

  const [t, locale] = await Promise.all([
    getTranslations('liga'),
    getLocale(),
  ]);

  const { data: leagues } = await supabase
    .from('leagues')
    .select('id, name, status, season_start, season_end, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  // Fetch round counts per league in one query
  const leagueIds = (leagues ?? []).map((l) => l.id);
  const { data: roundCounts } = leagueIds.length
    ? await supabase
        .from('league_rounds')
        .select('league_id')
        .in('league_id', leagueIds)
    : { data: [] };

  const countByLeague = new Map<string, number>();
  for (const r of roundCounts ?? []) {
    countByLeague.set(r.league_id, (countByLeague.get(r.league_id) ?? 0) + 1);
  }

  const rows = (leagues ?? []) as Array<{
    id: string;
    name: string;
    status: 'draft' | 'active' | 'finished';
    season_start: string;
    season_end: string;
    created_at: string;
  }>;

  return (
    <AdminShell>
      <TopBar
        backHref="/admin"
        kicker={t('ledger.kicker')}
        action={
          <Link
            href="/admin/liga/new"
            className="rounded-full border border-border bg-surface px-2.5 py-[5px] font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-text hover:border-primary/40"
          >
            {t('ledger.createButton')}
          </Link>
        }
      />
      <BrassRibbon kicker={t('ledger.brassRibbon')} />
      <PageHeader
        title={t('ledger.pageTitle')}
        subtitle={t('ledger.pageSubtitle')}
      />

      {statusCode === 'deleted' && (
        <div className="mb-4">
          <Banner tone="success">{t('ledger.deletedBanner')}</Banner>
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            {t('ledger.emptyState')}{' '}
            <SmartLink
              href="/admin/liga/new"
              className="text-text underline hover:no-underline"
            >
              {t('ledger.emptyStateLink')}
            </SmartLink>{' '}
            {t('ledger.emptyStateSuffix')}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((league) => {
            const rounds = countByLeague.get(league.id) ?? 0;
            return (
              <li key={league.id}>
                <SmartLink href={`/admin/liga/${league.id}`}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-serif text-base text-text">
                          {league.name}
                        </p>
                        <p className="text-xs text-muted mt-1">
                          {formatShortDateLocale(league.season_start, locale as AppLocale)} –{' '}
                          {formatShortDateLocale(league.season_end, locale as AppLocale)} ·{' '}
                          {t('ledger.roundCount', { count: rounds })}
                        </p>
                      </div>
                      <StatusChip
                        tone={STATUS_TO_CHIP[league.status]}
                        label={t(`status.${league.status}`)}
                      />
                    </div>
                  </Card>
                </SmartLink>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-6">
        <Link
          href="/admin/liga/new"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary text-white px-4 py-3 text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          {t('ledger.createLeagueButton')}
        </Link>
      </div>
    </AdminShell>
  );
}
