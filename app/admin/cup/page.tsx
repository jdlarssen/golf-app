import Link from 'next/link';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';

type SearchParams = Promise<{
  error?: string | string[];
  status?: string | string[];
  name?: string | string[];
}>;

const STATUS_MESSAGES: Record<string, (name?: string) => string> = {
  deleted: (name) => `Cupen «${name ?? ''}» er slettet.`,
};

const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'Cupen finnes ikke.',
};

const STATUS_TO_CHIP: Record<'draft' | 'active' | 'finished', StatusChipTone> = {
  draft: 'utkast',
  active: 'aktiv',
  finished: 'signert',
};

const STATUS_LABEL: Record<'draft' | 'active' | 'finished', string> = {
  draft: 'Utkast',
  active: 'Pågående',
  finished: 'Avsluttet',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CupListPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const errorCode = first(sp.error);
  const statusCode = first(sp.status);
  const name = first(sp.name);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const statusMessage = statusCode
    ? STATUS_MESSAGES[statusCode]?.(name)
    : undefined;

  const supabase = await getServerClient();
  await requireAdmin(supabase);
  const userId = await getProxyVerifiedUserId();

  const { data: cups } = await supabase
    .from('tournaments')
    .select(
      'id, name, status, team_1_name, team_2_name, points_to_win, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(50);

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
      <TopBar backHref="/admin" kicker="Sekretariatet" userId={userId} />
      <BrassRibbon kicker="Cuper" />
      <PageHeader
        title="Cuper"
        subtitle="Multi-match-turneringer i Ryder Cup-stil."
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

      <div className="mb-5">
        <Link href="/admin/cup/new">
          <Button className="w-full">Opprett ny cup</Button>
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            Ingen cuper ennå. Trykk «Opprett ny cup» over for å komme i gang.
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
                        {cup.team_1_name} mot {cup.team_2_name} · først til{' '}
                        {String(cup.points_to_win).replace('.', ',')} point
                      </p>
                    </div>
                    <StatusChip
                      tone={STATUS_TO_CHIP[cup.status]}
                      label={STATUS_LABEL[cup.status]}
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
