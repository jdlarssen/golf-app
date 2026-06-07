import { notFound } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { Banner } from '@/components/ui/Banner';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatShortDateNb } from '@/lib/format/date';
import { handleDeleteLeague } from '@/lib/league/actions';

/**
 * Shared delete-confirm surface for a league (#485), rendered by two routes:
 *  - `/admin/liga/[id]/slett` (variant="admin") — AdminShell, back to the admin
 *    management page.
 *  - `/klubber/[id]/liga/[ligaId]/slett` (variant="club") — AppShell, back to
 *    the club management page, so a club-admin never leaves club chrome.
 *
 * `deleteLeague` already redirects a club-league deletion to `/klubber/[groupId]`,
 * so on success both variants land correctly. The variant only switches the
 * shell + the back/cancel hrefs; the warning, the deletion summary (round /
 * participant / flight counts), and the destructive button are identical.
 */

const ERROR_MESSAGES: Record<string, string> = {
  delete_failed: 'Slettingen feilet. Prøv igjen, eller sjekk Vercel-loggene.',
  missing: 'Noe gikk galt. Prøv igjen.',
};

const STATUS_WARNINGS: Record<'draft' | 'active' | 'finished', string | null> = {
  draft: null,
  active:
    'Ligaen pågår nå. Sletting fjerner ligaen for alltid, men selve flight-spillene forblir som frittstående spill.',
  finished:
    'Ligaen er avsluttet. Sesong-tabellen forsvinner, men selve flight-spillene forblir som frittstående spill.',
};

export type LigaDeleteVariant = 'admin' | 'club';

export async function LigaDeleteConfirm({
  leagueId,
  variant,
  errorCode,
}: {
  leagueId: string;
  variant: LigaDeleteVariant;
  errorCode?: string;
}) {
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;

  const supabase = await getServerClient();

  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, status, season_start, season_end, group_id')
    .eq('id', leagueId)
    .maybeSingle<{
      id: string;
      name: string;
      status: 'draft' | 'active' | 'finished';
      season_start: string;
      season_end: string;
      group_id: string | null;
    }>();

  if (!league) notFound();
  // #485: en frittstående liga hører ikke hjemme under /klubber — 404 i klubb-
  // varianten så vi aldri bygger en /klubber/null/...-lenke (kun nåbar ved at en
  // global admin håndskriver URL-en).
  if (variant === 'club' && !league.group_id) notFound();

  // Count rounds, participants, and linked flights for the deletion summary.
  const [{ count: roundCount }, { count: playerCount }] = await Promise.all([
    supabase
      .from('league_rounds')
      .select('id', { head: true, count: 'exact' })
      .eq('league_id', leagueId),
    supabase
      .from('league_players')
      .select('user_id', { head: true, count: 'exact' })
      .eq('league_id', leagueId),
  ]);

  // Flights: count games linked to rounds of this league.
  const { data: roundIds } = await supabase
    .from('league_rounds')
    .select('id')
    .eq('league_id', leagueId);
  const roundIdList = (roundIds ?? []).map((r) => r.id);
  const { count: flightCount } =
    roundIdList.length > 0
      ? await supabase
          .from('games')
          .select('id', { head: true, count: 'exact' })
          .in('league_round_id', roundIdList)
      : { count: 0 };

  const warning = STATUS_WARNINGS[league.status];

  const Shell = variant === 'admin' ? AdminShell : AppShell;
  const backHref =
    variant === 'club'
      ? `/klubber/${league.group_id}/liga/${leagueId}`
      : `/admin/liga/${leagueId}`;

  return (
    <Shell>
      <TopBar backHref={backHref} kicker="Klubbhuset" />
      <BrassRibbon kicker="Bekreft sletting" />

      <div className="px-1">
        <h1 className="mb-3 font-serif text-2xl font-medium leading-snug tracking-[-0.015em]">
          Slett «{league.name}»?
        </h1>
        <p className="font-sans text-[13px] leading-relaxed text-muted">
          {formatShortDateNb(league.season_start)} – {formatShortDateNb(league.season_end)}
        </p>
      </div>

      {warning && (
        <div className="mt-4">
          <Banner tone={league.status === 'active' ? 'error' : 'warning'}>
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
          <li>Ligaen «{league.name}»</li>
          {(roundCount ?? 0) > 0 && (
            <li>
              <span className="tabular-nums">{roundCount}</span>{' '}
              {roundCount === 1 ? 'runde' : 'runder'} og tilhørende vinduer
            </li>
          )}
          {(playerCount ?? 0) > 0 && (
            <li>
              <span className="tabular-nums">{playerCount}</span>{' '}
              {playerCount === 1 ? 'deltaker' : 'deltakere'}
            </li>
          )}
        </ul>
        {(flightCount ?? 0) > 0 && (
          <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
            <span className="tabular-nums">{flightCount}</span>{' '}
            {flightCount === 1 ? 'flight' : 'flights'} forblir som frittstående spill (liga-koblingen fjernes).
          </p>
        )}
        <p className="mt-3 font-sans text-[12px] leading-relaxed text-muted">
          Handlingen kan ikke angres.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <form action={handleDeleteLeague}>
          <input type="hidden" name="league_id" value={league.id} />
          <SubmitButton
            className="w-full"
            style={{
              background: 'var(--danger-deep)',
              borderColor: 'var(--danger-deep)',
            }}
            pendingLabel="Sletter …"
          >
            Slett ligaen for alltid
          </SubmitButton>
        </form>
        <SmartLink
          href={backHref}
          className="rounded-full border border-border bg-surface px-3 py-3 text-center font-sans text-[13px] font-medium text-text min-h-[44px] flex items-center justify-center"
        >
          Avbryt
        </SmartLink>
      </div>
    </Shell>
  );
}
