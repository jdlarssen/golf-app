import { notFound } from 'next/navigation';
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
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getCupSnapshot, type CupRosterPlayer } from '@/lib/cup/getCupSnapshot';
import { startTournament, finishTournament } from '@/lib/cup/actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string | string[]; status?: string | string[] }>;

const ERROR_MESSAGES: Record<string, string> = {
  name: 'Cup-navnet må være mellom 1 og 80 tegn.',
  team_1: 'Navn på lag 1 må være mellom 1 og 40 tegn.',
  team_2: 'Navn på lag 2 må være mellom 1 og 40 tegn.',
  team_dup: 'Lagene må ha forskjellige navn.',
  points: 'Point-målet må være et positivt tall.',
  update_failed: 'Klarte ikke å oppdatere cupen.',
  start_failed: 'Klarte ikke å starte cupen.',
  finish_failed: 'Klarte ikke å avslutte cupen.',
  too_few_matches: 'Du må opprette minst 2 matches før du kan starte cupen.',
  wrong_status: 'Cupen er ikke i utkast-status og kan ikke startes.',
  already_finished: 'Cupen er allerede avsluttet.',
};

const STATUS_MESSAGES: Record<string, string> = {
  created: 'Cupen er opprettet. Legg til matches under for å komme i gang.',
  updated: 'Cupen er oppdatert.',
  started: 'Cupen er startet. Spillerne får mail-varsel.',
  finished: 'Cupen er avsluttet. Resultatet er sendt til alle deltakere.',
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function preferredName(p: CupRosterPlayer): string {
  return p.nickname?.trim() || p.name?.trim() || 'Ukjent spiller';
}

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

function formatPoints(n: number): string {
  return String(n).replace('.', ',');
}

export default async function CupDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errorCode = first(sp.error);
  const statusCode = first(sp.status);
  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const statusMessage = statusCode ? STATUS_MESSAGES[statusCode] : undefined;

  const supabase = await getServerClient();
  await requireAdmin(supabase);
  const userId = await getProxyVerifiedUserId();

  const snapshot = await getCupSnapshot(id);
  if (!snapshot) notFound();

  const { tournament, leaderboard, roster } = snapshot;
  const chipTone = STATUS_TO_CHIP[tournament.status];
  const statusLabel = STATUS_LABEL[tournament.status];

  const canStart = tournament.status === 'draft' && leaderboard.matches.length >= 2;
  const canFinish = tournament.status === 'active';
  const showStartHint =
    tournament.status === 'draft' && leaderboard.matches.length < 2;

  return (
    <AdminShell>
      <TopBar backHref="/admin" kicker="Sekretariatet" userId={userId} />
      <BrassRibbon kicker={`Cup · ${statusLabel}`} />
      <PageHeader
        title={tournament.name}
        subtitle={`${tournament.team_1_name} mot ${tournament.team_2_name} · først til ${formatPoints(tournament.points_to_win)} point`}
        action={<StatusChip tone={chipTone} label={statusLabel} />}
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

      {/* Master-leaderboard-preview */}
      <Card className="mb-5">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {tournament.team_1_name}
            </p>
            <p className="font-serif text-4xl tabular-nums text-primary mt-1">
              {formatPoints(leaderboard.team1Points)}
            </p>
          </div>
          <div>
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {tournament.team_2_name}
            </p>
            <p className="font-serif text-4xl tabular-nums text-primary mt-1">
              {formatPoints(leaderboard.team2Points)}
            </p>
          </div>
        </div>
        <p className="text-center text-xs text-muted mt-3">
          Først til {formatPoints(tournament.points_to_win)} point ·{' '}
          {leaderboard.finishedMatches} av {leaderboard.matches.length} matches
          spilt
        </p>
        <div className="mt-3 text-center">
          <SmartLink
            href={`/cup/${id}`}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            Åpne offentlig leaderboard →
          </SmartLink>
        </div>
      </Card>

      {/* Lag-roster */}
      <section className="mb-5">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
          Lag-roster
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="font-serif text-base text-text mb-2">
              {tournament.team_1_name}
            </p>
            {roster.team1.length === 0 ? (
              <p className="text-xs text-muted">
                Ingen spillere. Roster fylles fra matches.
              </p>
            ) : (
              <ul className="space-y-1 text-sm text-text">
                {roster.team1.map((p) => (
                  <li key={p.userId}>{preferredName(p)}</li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <p className="font-serif text-base text-text mb-2">
              {tournament.team_2_name}
            </p>
            {roster.team2.length === 0 ? (
              <p className="text-xs text-muted">
                Ingen spillere. Roster fylles fra matches.
              </p>
            ) : (
              <ul className="space-y-1 text-sm text-text">
                {roster.team2.map((p) => (
                  <li key={p.userId}>{preferredName(p)}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {/* Matches-liste */}
      <section className="mb-5">
        <div className="mb-2">
          <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Matches
          </h2>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Link
            href={`/admin/games/new?intent=cup&tournament_id=${id}&game_mode=singles_matchplay`}
            className="rounded-md border border-border bg-surface px-3 py-2 text-center text-xs font-medium text-primary hover:border-primary/40"
          >
            + Singles match
          </Link>
          <Link
            href={`/admin/games/new?intent=cup&tournament_id=${id}&game_mode=fourball_matchplay`}
            className="rounded-md border border-border bg-surface px-3 py-2 text-center text-xs font-medium text-primary hover:border-primary/40"
          >
            + Fourball match
          </Link>
          <Link
            href={`/admin/games/new?intent=cup&tournament_id=${id}&game_mode=foursomes_matchplay`}
            className="rounded-md border border-border bg-surface px-3 py-2 text-center text-xs font-medium text-primary hover:border-primary/40"
          >
            + Foursomes match
          </Link>
        </div>
        {leaderboard.matches.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              Ingen matches ennå. Trykk «Opprett match» over for å legge til
              første kamp.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {leaderboard.matches.map((m) => (
              <li key={m.gameId}>
                <SmartLink href={`/admin/games/${m.gameId}`}>
                  <Card>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                          {m.matchLabel ?? 'Match'}
                        </p>
                        <p className="font-serif text-base text-text mt-1">
                          {m.team1PlayerName}{' '}
                          <span className="text-muted">mot</span>{' '}
                          {m.team2PlayerName}
                        </p>
                        {m.result && (
                          <p className="text-xs text-muted mt-1">
                            {m.result.winnerSide === 'tied'
                              ? 'Halvert (AS)'
                              : m.result.winnerSide === 1
                                ? `${m.result.formatted} til ${
                                    m.gameMode === 'fourball_matchplay'
                                      ? tournament.team_1_name
                                      : m.team1PlayerName
                                  }`
                                : `${m.result.formatted} til ${
                                    m.gameMode === 'fourball_matchplay'
                                      ? tournament.team_2_name
                                      : m.team2PlayerName
                                  }`}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 font-serif text-lg tabular-nums text-primary">
                        {formatPoints(m.pointsTeam1)}–{formatPoints(m.pointsTeam2)}
                      </div>
                    </div>
                  </Card>
                </SmartLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cup-handlinger */}
      <section className="space-y-3 mt-6">
        {tournament.status === 'draft' && (
          <>
            {showStartHint && (
              <Banner tone="info">
                Du må opprette minst 2 matches før du kan starte cupen.
              </Banner>
            )}
            <form action={startTournament}>
              <input type="hidden" name="id" value={tournament.id} />
              <Button type="submit" className="w-full" disabled={!canStart}>
                Start cupen
              </Button>
            </form>
          </>
        )}

        {tournament.status === 'active' && (
          <form action={finishTournament}>
            <input type="hidden" name="id" value={tournament.id} />
            <Button type="submit" className="w-full" disabled={!canFinish}>
              Avslutt cupen
            </Button>
          </form>
        )}

        <SmartLink
          href={`/admin/cup/${tournament.id}/slett`}
          className="block text-center text-xs text-danger underline-offset-2 hover:underline pt-2"
        >
          Slett cupen
        </SmartLink>
      </section>
    </AdminShell>
  );
}
