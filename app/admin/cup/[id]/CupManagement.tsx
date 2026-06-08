import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { SmartLink } from '@/components/ui/SmartLink';
import { getCupSnapshot, type CupRosterPlayer } from '@/lib/cup/getCupSnapshot';
import { startTournament, finishTournament } from '@/lib/cup/actions';

export type CupManagementVariant = 'admin' | 'club';

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
  started: 'Cupen er startet. Spillerne får varsel.',
  finished: 'Cupen er avsluttet. Resultatet er sendt til alle deltakere.',
  matches_generated: 'Matchene er opprettet. Se gjennom listen under.',
};

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

const CUP_MATCH_MODES = new Set([
  'fourball_matchplay',
  'foursomes_matchplay',
  'greensome_matchplay',
  'chapman_matchplay',
  'gruesome_matchplay',
]);

/**
 * Delt cup-styringsflate (#524). Begge ruter (`/admin/cup/[id]` og
 * `/klubber/[id]/cup/[cupId]`) rendrer denne. Gaten gjøres i ruten; komponenten
 * henter snapshot + chrome.
 *
 * Variant-forskjeller: shell (Admin/App), back-href, generer/slett-href, og at
 * club-varianten skjuler de manuelle «+ match»-lenkene (de peker til
 * /admin/games-wizarden = admin-chrome) — klubb legger til kamper via generer.
 */
export async function CupManagement({
  tournamentId,
  variant,
  errorCode,
  statusCode,
}: {
  tournamentId: string;
  variant: CupManagementVariant;
  errorCode?: string;
  statusCode?: string;
}) {
  const snapshot = await getCupSnapshot(tournamentId);
  if (!snapshot) notFound();

  const { tournament, leaderboard, roster } = snapshot;
  const groupId = tournament.group_id;
  const isClub = variant === 'club';

  let clubName: string | null = null;
  if (isClub && groupId) {
    const { data: club } = await getAdminClient()
      .from('groups')
      .select('name')
      .eq('id', groupId)
      .maybeSingle();
    clubName = (club?.name as string | null | undefined) ?? null;
  }

  const errorMessage = errorCode ? ERROR_MESSAGES[errorCode] : undefined;
  const statusMessage = statusCode ? STATUS_MESSAGES[statusCode] : undefined;

  const chipTone = STATUS_TO_CHIP[tournament.status];
  const statusLabel = STATUS_LABEL[tournament.status];

  const canStart = tournament.status === 'draft' && leaderboard.matches.length >= 2;
  const canFinish = tournament.status === 'active';
  const showStartHint =
    tournament.status === 'draft' && leaderboard.matches.length < 2;

  const Shell = isClub ? AppShell : AdminShell;
  const backHref = isClub && groupId ? `/klubber/${groupId}` : '/admin/cup';
  const kicker = isClub ? (clubName ?? 'Klubbhuset') : 'Klubbhuset';
  const ribbonKicker = isClub ? `Klubb-cup · ${statusLabel}` : `Cup · ${statusLabel}`;
  const genererHref =
    isClub && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}/generer`
      : `/admin/cup/${tournamentId}/generer`;
  const slettHref =
    isClub && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}/slett`
      : `/admin/cup/${tournamentId}/slett`;

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={kicker} />
      <BrassRibbon kicker={ribbonKicker} />
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
            href={`/cup/${tournamentId}`}
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
        {tournament.status === 'draft' && (
          <div className="mb-3">
            <Link
              href={genererHref}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary text-white px-4 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Generer matcher
            </Link>
          </div>
        )}
        {/* De manuelle per-match-lenkene går til /admin/games-wizarden (admin-
            chrome) — vises bare i admin-varianten. Klubb legger til via generer. */}
        {!isClub && (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ['singles_matchplay', '+ Singles match'],
              ['fourball_matchplay', '+ Fourball match'],
              ['foursomes_matchplay', '+ Foursomes match'],
              ['greensome_matchplay', '+ Greensome match'],
              ['chapman_matchplay', '+ Chapman match'],
              ['gruesome_matchplay', '+ Gruesome match'],
            ].map(([mode, label]) => (
              <Link
                key={mode}
                href={`/admin/games/new?intent=cup&tournament_id=${tournamentId}&game_mode=${mode}`}
                className="rounded-md border border-border bg-surface px-3 py-2 text-center text-xs font-medium text-primary hover:border-primary/40"
              >
                {label}
              </Link>
            ))}
          </div>
        )}
        {leaderboard.matches.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              Ingen matches ennå. Trykk «Generer matcher» over for å legge til
              kamper.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {leaderboard.matches.map((m) => {
              const isTeamFormat = m.gameMode != null && CUP_MATCH_MODES.has(m.gameMode);
              const card = (
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
                                  isTeamFormat
                                    ? tournament.team_1_name
                                    : m.team1PlayerName
                                }`
                              : `${m.result.formatted} til ${
                                  isTeamFormat
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
              );
              // Admin kan bore ned i hver match (full game-admin); klubb-varianten
              // viser dem som info-kort (ingen admin-chrome-lekkasje).
              return (
                <li key={m.gameId}>
                  {isClub ? (
                    card
                  ) : (
                    <SmartLink href={`/admin/games/${m.gameId}`}>{card}</SmartLink>
                  )}
                </li>
              );
            })}
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
              <SubmitButton className="w-full" disabled={!canStart} pendingLabel="Starter …">
                Start cupen
              </SubmitButton>
            </form>
          </>
        )}

        {tournament.status === 'active' && (
          <form action={finishTournament}>
            <input type="hidden" name="id" value={tournament.id} />
            <SubmitButton className="w-full" disabled={!canFinish} pendingLabel="Avslutter …">
              Avslutt cupen
            </SubmitButton>
          </form>
        )}

        <SmartLink
          href={slettHref}
          className="block text-center text-xs text-danger underline-offset-2 hover:underline pt-2"
        >
          Slett cupen
        </SmartLink>
      </section>
    </Shell>
  );
}
