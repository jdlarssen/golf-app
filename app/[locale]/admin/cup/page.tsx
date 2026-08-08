import { first } from '@/lib/url/searchParams';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getRoleContext } from '@/lib/admin/auth';
import {
  getMyCupIds,
  cupLedgerHref,
  cupLedgerResult,
  type CupLedgerRow,
} from '@/lib/cup/myCups';
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

const CUP_SELECT =
  'id, name, status, team_1_name, team_2_name, points_to_win, created_at, created_by, group_id, winner_team';

type ServerSupabase = Awaited<ReturnType<typeof getServerClient>>;

/** Admin-lista: alle cuper, nyest først — uendret siden #526. */
async function fetchAllCups(supabase: ServerSupabase): Promise<CupLedgerRow[]> {
  const { data } = await supabase
    .from('tournaments')
    .select(CUP_SELECT)
    .order('created_at', { ascending: false })
    .limit(50);
  // status/winner_team er text/smallint i DB, låst av CHECK — samme cast som
  // getCupSnapshot gjør på de samme kolonnene.
  return (data ?? []) as unknown as CupLedgerRow[];
}

/**
 * Spiller-lista (#1463): cupene brukeren er en del av. Ids-ene utledes fra
 * brukerens egne rader (RLS-scopet, `getMyCupIds`), mens selve radene hentes
 * med admin-klient: en deltaker i en klubb-cup uten klubbmedlemskap får ikke
 * lest tournament-raden under RLS, men kan åpne `/cup/[id]`. Retten følger av
 * spillerens egne rader — samme authz-form som `getCupSnapshot`.
 */
async function fetchMyCups(
  supabase: ServerSupabase,
  userId: string,
): Promise<CupLedgerRow[]> {
  const ids = await getMyCupIds(supabase, userId);
  if (ids.length === 0) return [];
  const { data } = await getAdminClient()
    .from('tournaments')
    .select(CUP_SELECT)
    .in('id', ids)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []) as unknown as CupLedgerRow[];
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
  // Admin ser alle cuper; en vanlig bruker ser cupene hen er en del av (#1463)
  // — opprettet, i utkast-spillerlista, eller spilt.
  const { userId, isAdmin } = await getRoleContext(supabase);

  const rows = isAdmin
    ? await fetchAllCups(supabase)
    : await fetchMyCups(supabase, userId);

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker={t('ledger.kicker')} />
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
            {t.rich('ledger.emptyBody', {
              a: (chunks) => (
                <SmartLink
                  href={
                    isAdmin
                      ? '/admin/games/new?intent=cup'
                      : '/opprett-spill?intent=cup'
                  }
                  className="text-text underline hover:no-underline"
                >
                  {chunks}
                </SmartLink>
              ),
            })}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((cup) => {
            const result = cupLedgerResult(cup);
            return (
            <li key={cup.id}>
              <SmartLink href={cupLedgerHref(cup, { userId, isAdmin })}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-base text-text">
                        {cup.name}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {cup.points_to_win === null
                          ? t('ledger.rowSubtitlePending', {
                              team1: cup.team_1_name,
                              team2: cup.team_2_name,
                            })
                          : t('ledger.rowSubtitle', {
                              team1: cup.team_1_name,
                              team2: cup.team_2_name,
                              points: String(cup.points_to_win).replace('.', ','),
                            })}
                      </p>
                      {result && (
                        <p
                          className="mt-1 text-xs font-medium text-text"
                          data-testid="cup-ledger-result"
                        >
                          {result.kind === 'winner'
                            ? t('results.winner', { team: result.team })
                            : t('results.tied')}
                        </p>
                      )}
                    </div>
                    <StatusChip
                      tone={STATUS_TO_CHIP[cup.status]}
                      label={t(`status.${cup.status}`)}
                    />
                  </div>
                </Card>
              </SmartLink>
            </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
