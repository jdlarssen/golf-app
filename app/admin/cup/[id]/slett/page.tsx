import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { AdminShell } from '@/components/ui/AdminShell';
import { TopBar } from '@/components/ui/TopBar';
import { Banner } from '@/components/ui/Banner';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Button } from '@/components/ui/Button';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { deleteTournament } from '@/lib/cup/actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  delete_failed: 'Slettingen feilet. Prøv igjen, eller sjekk Vercel-loggene.',
};

const STATUS_WARNINGS: Record<'draft' | 'active' | 'finished', string | null> = {
  draft: null,
  active:
    'Cupen pågår nå. Sletting fjerner cup-en for alltid, men selve matches forblir som frittstående spill.',
  finished:
    'Cupen er avsluttet. Resultatet forsvinner fra leaderboardet, men selve matches forblir som frittstående spill.',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function DeleteCupPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errorCode = first(sp.error);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();
  await requireAdmin(supabase);
  const userId = await getProxyVerifiedUserId();

  const { data: cup } = await supabase
    .from('tournaments')
    .select('id, name, status, team_1_name, team_2_name')
    .eq('id', id)
    .maybeSingle<{
      id: string;
      name: string;
      status: 'draft' | 'active' | 'finished';
      team_1_name: string;
      team_2_name: string;
    }>();

  if (!cup) notFound();

  const { count: matchCount } = await supabase
    .from('games')
    .select('id', { head: true, count: 'exact' })
    .eq('tournament_id', id);

  const warning = STATUS_WARNINGS[cup.status];

  return (
    <AdminShell>
      <TopBar
        backHref={`/admin/cup/${id}`}
        kicker="Sekretariatet"
        userId={userId}
      />
      <BrassRibbon kicker="Bekreft sletting" />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Slett «{cup.name}»?
        </h1>
        <p className="font-sans text-[13px] leading-relaxed text-muted">
          {cup.team_1_name} mot {cup.team_2_name}
        </p>
      </div>

      {warning && (
        <div className="mt-4">
          <Banner tone={cup.status === 'active' ? 'error' : 'warning'}>
            {warning}
          </Banner>
        </div>
      )}

      {errorMessage && (
        <div className="mt-4">
          <Banner tone="error">{errorMessage}</Banner>
        </div>
      )}

      <div
        className="mt-5 rounded-xl border bg-surface px-4 py-3.5"
        style={{ borderColor: 'rgba(180, 60, 60, 0.18)' }}
      >
        <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Slettes permanent
        </p>
        <ul className="space-y-1 font-sans text-[13px] text-text">
          <li>Cupen «{cup.name}»</li>
          <li>Lag-roster og master-leaderboard</li>
        </ul>
        {(matchCount ?? 0) > 0 && (
          <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
            {matchCount} {matchCount === 1 ? 'match' : 'matches'} forblir som
            frittstående spill (cup-koblingen fjernes).
          </p>
        )}
        <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
          Handlingen kan ikke angres.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={deleteTournament}>
          <input type="hidden" name="id" value={cup.id} />
          <Button
            type="submit"
            className="w-full"
            style={{
              background: 'var(--danger-deep)',
              borderColor: 'var(--danger-deep)',
            }}
          >
            Slett cupen for alltid
          </Button>
        </form>
        <SmartLink
          href={`/admin/cup/${id}`}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text"
        >
          Avbryt
        </SmartLink>
      </div>
    </AdminShell>
  );
}
