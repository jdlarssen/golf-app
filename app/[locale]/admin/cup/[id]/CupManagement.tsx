import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
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

const STATUS_TO_CHIP: Record<'draft' | 'active' | 'finished', StatusChipTone> = {
  draft: 'utkast',
  active: 'aktiv',
  finished: 'signert',
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
 * Variant-forskjeller: shell (Admin/App), back/generer/slett-href, og at
 * admin kan bore ned i hver match (SmartLink til /admin/games/[id]) mens
 * club-varianten viser matchene som rene info-kort.
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
  const [snapshot, t] = await Promise.all([
    getCupSnapshot(tournamentId),
    getTranslations('cup'),
  ]);
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

  const errorMessageMap: Record<string, string> = {
    start_failed: t('manage.errors.start_failed'),
    finish_failed: t('manage.errors.finish_failed'),
    too_few_matches: t('manage.errors.too_few_matches'),
    wrong_status: t('manage.errors.wrong_status'),
    already_finished: t('manage.errors.already_finished'),
  };
  const statusMessageMap: Record<string, string> = {
    created: t('manage.statusMessages.created'),
    started: t('manage.statusMessages.started'),
    finished: t('manage.statusMessages.finished'),
    matches_generated: t('manage.statusMessages.matches_generated'),
  };
  const errorMessage = errorCode ? errorMessageMap[errorCode] : undefined;
  const statusMessage = statusCode ? statusMessageMap[statusCode] : undefined;

  const chipTone = STATUS_TO_CHIP[tournament.status];
  const statusLabel = t(`status.${tournament.status}`);

  const canStart = tournament.status === 'draft' && leaderboard.matches.length >= 2;
  const canFinish = tournament.status === 'active';
  const showStartHint =
    tournament.status === 'draft' && leaderboard.matches.length < 2;

  function preferredName(p: CupRosterPlayer): string {
    return p.nickname?.trim() || p.name?.trim() || t('manage.unknownPlayer');
  }

  const Shell = isClub ? AppShell : AdminShell;
  const backHref = isClub && groupId ? `/klubber/${groupId}` : '/admin/cup';
  const kicker = isClub ? (clubName ?? t('ledger.kicker')) : t('ledger.kicker');
  const ribbonKicker = isClub
    ? t('manage.brassRibbonClub', { status: statusLabel })
    : t('manage.brassRibbonAdmin', { status: statusLabel });
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
        subtitle={t('manage.headerSubtitle', {
          team1: tournament.team_1_name,
          team2: tournament.team_2_name,
          points: formatPoints(tournament.points_to_win),
        })}
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
          {t('manage.matchesSummary', {
            points: formatPoints(tournament.points_to_win),
            finished: leaderboard.finishedMatches,
            total: leaderboard.matches.length,
          })}
        </p>
        <div className="mt-3 text-center">
          <SmartLink
            href={`/cup/${tournamentId}`}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            {t('manage.openLeaderboard')}
          </SmartLink>
        </div>
      </Card>

      {/* Lag-roster */}
      <section className="mb-5">
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
          {t('manage.rosterHeading')}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="font-serif text-base text-text mb-2">
              {tournament.team_1_name}
            </p>
            {roster.team1.length === 0 ? (
              <p className="text-xs text-muted">
                {t('manage.emptyRoster')}
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
                {t('manage.emptyRoster')}
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
            {t('manage.matchesHeading')}
          </h2>
        </div>
        {tournament.status === 'draft' && (
          <div className="mb-3">
            <Link
              href={genererHref}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary text-white px-4 py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t('manage.generateButton')}
            </Link>
          </div>
        )}
        {leaderboard.matches.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              {t('manage.emptyMatches')}
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
                        <span className="text-muted">{t('manage.mot')}</span>{' '}
                        {m.team2PlayerName}
                      </p>
                      {m.result && (
                        <p className="text-xs text-muted mt-1">
                          {m.result.winnerSide === 'tied'
                            ? t('manage.matchTied')
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
                {t('manage.startHint')}
              </Banner>
            )}
            <form action={startTournament}>
              <input type="hidden" name="id" value={tournament.id} />
              <SubmitButton className="w-full" disabled={!canStart} pendingLabel={t('manage.startPending')}>
                {t('manage.startButton')}
              </SubmitButton>
            </form>
          </>
        )}

        {tournament.status === 'active' && (
          <form action={finishTournament}>
            <input type="hidden" name="id" value={tournament.id} />
            <SubmitButton className="w-full" disabled={!canFinish} pendingLabel={t('manage.finishPending')}>
              {t('manage.finishButton')}
            </SubmitButton>
          </form>
        )}

        <SmartLink
          href={slettHref}
          className="block text-center text-xs text-danger underline-offset-2 hover:underline pt-2"
        >
          {t('manage.deleteLink')}
        </SmartLink>
      </section>
    </Shell>
  );
}
