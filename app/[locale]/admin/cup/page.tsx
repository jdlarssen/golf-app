import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getRoleContext } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';

type SearchParams = Promise<{
  error?: string | string[];
  status?: string | string[];
  name?: string | string[];
}>;

const STATUS_TO_CHIP: Record<'draft' | 'active' | 'finished', StatusChipTone> = {
  draft: 'utkast',
  active: 'aktiv',
  finished: 'signert',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CupListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [sp, t] = await Promise.all([searchParams, getTranslations('cup')]);
  const errorCode = first(sp.error);
  const statusCode = first(sp.status);
  const name = first(sp.name);
  const errorMessage = errorCode ? t(`manage.errors.${errorCode}` as Parameters<typeof t>[0]) : undefined;
  const statusMessage =
    statusCode === 'deleted' && name
      ? t('manage.deletedMessage', { name })
      : undefined;

  const supabase = await getServerClient();
  // #526: lista er reachable for alle (admin-layout er auth-only per #392).
  // Admin ser alle cuper; en vanlig bruker ser kun sine egne personlige cuper.
  const { userId, isAdmin } = await getRoleContext(supabase);

  let query = supabase
    .from('tournaments')
    .select(
      'id, name, status, team_1_name, team_2_name, points_to_win, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(50);
  if (!isAdmin) {
    query = query.eq('created_by', userId).is('group_id', null);
  }
  const { data: cups } = await query;

  const rows = (cups ?? []) as Array<{
    id: string;
    name: string;
    status: 'draft' | 'active' | 'finished';
    team_1_name: string;
    team_2_name: string;
    points_to_win: number;
    created_at: string;
  }>;

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker="Klubbhuset" />
      <BrassRibbon kicker={t('ledger.kicker')} />
      <PageHeader
        title={t('ledger.pageTitle')}
        subtitle={t('ledger.pageSubtitle')}
      />

      {errorMessage && (
        <div className="mb-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}
      {statusMessage && !errorMessage && (
        <div className="mb-4">
          <Banner tone="success">{statusMessage}</Banner>
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            {t('ledger.emptyText')}{' '}
            <SmartLink
              href="/admin/games/new?intent=cup"
              className="text-text underline hover:no-underline"
            >
              {t('ledger.emptyLink')}
            </SmartLink>{' '}
            for å komme i gang.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((cup) => (
            <li key={cup.id}>
              <SmartLink href={`/admin/cup/${cup.id}`}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-base text-text">
                        {cup.name}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {t('ledger.rowSubtitle', {
                          team1: cup.team_1_name,
                          team2: cup.team_2_name,
                          points: String(cup.points_to_win).replace('.', ','),
                        })}
                      </p>
                    </div>
                    <StatusChip
                      tone={STATUS_TO_CHIP[cup.status]}
                      label={t(`status.${cup.status}`)}
                    />
                  </div>
                </Card>
              </SmartLink>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
