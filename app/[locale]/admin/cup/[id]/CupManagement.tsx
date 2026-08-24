import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/ui/AdminShell';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { BrassRibbon } from '@/components/ui/BrassRibbon';
import { PageHeader } from '@/components/ui/PageHeader';
import { Banner } from '@/components/ui/Banner';
import { Card } from '@/components/ui/Card';
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { SmartLink } from '@/components/ui/SmartLink';
import { getCupSnapshot, type CupRosterPlayer } from '@/lib/cup/getCupSnapshot';
import { matchBlocksOneTapFinish } from '@/lib/cup/matchSubmissionStatus';
import { formatPoints } from '@/lib/cup/formatPoints';
import { unregisteredSideAwards } from '@/lib/cup/sideAwardsRegistered';
import { SideAwardsPanel, type SideAwardRosterOption } from './SideAwardsPanel';
import { CupMatchList } from './CupMatchList';
import { CupActionsSection } from './CupActionsSection';
import { CupDoorsSection } from './CupDoorsSection';

export type CupManagementVariant = 'admin' | 'club';

const STATUS_TO_CHIP: Record<'draft' | 'active' | 'finished', StatusChipTone> = {
  draft: 'utkast',
  active: 'aktiv',
  finished: 'signert',
};

type CupTournamentForCopy = {
  points_to_win: number | null;
  status: 'draft' | 'active' | 'finished';
  team_1_name: string;
  team_2_name: string;
};

/**
 * Header-subtitle + matches-summary-copy (#1441, D8) — trukket ut av
 * `CupManagement` for å holde komponentens cyclomatic complexity nede; disse
 * grenene hører uansett sammen (samme points_to_win/status-beslutning).
 */
function cupHeaderSubtitle(
  tournament: CupTournamentForCopy,
  t: Awaited<ReturnType<typeof getTranslations<'cup'>>>,
): string {
  if (tournament.points_to_win !== null) {
    return t('manage.headerSubtitle', {
      team1: tournament.team_1_name,
      team2: tournament.team_2_name,
      points: formatPoints(tournament.points_to_win),
    });
  }
  // #1441 (D8): egendefinerte poeng-vekter holder points_to_win NULL gjennom
  // hele aktiv-fasen (ikke bare før start) — «poengmål klart ved start» ville
  // da vært misvisende etter start.
  return t(tournament.status === 'draft' ? 'manage.headerSubtitlePending' : 'manage.headerSubtitlePendingActive', {
    team1: tournament.team_1_name,
    team2: tournament.team_2_name,
  });
}

function cupMatchesSummary(
  tournament: CupTournamentForCopy,
  leaderboard: { finishedMatches: number; matches: unknown[] },
  t: Awaited<ReturnType<typeof getTranslations<'cup'>>>,
): string {
  if (tournament.points_to_win !== null) {
    return t('manage.matchesSummary', {
      points: formatPoints(tournament.points_to_win),
      finished: leaderboard.finishedMatches,
      total: leaderboard.matches.length,
    });
  }
  return t(tournament.status === 'draft' ? 'manage.matchesSummaryPending' : 'manage.matchesSummaryPendingActive', {
    finished: leaderboard.finishedMatches,
    total: leaderboard.matches.length,
  });
}

/**
 * Delt cup-styringsflate (#524). Begge ruter (`/admin/cup/[id]` og
 * `/klubber/[id]/cup/[cupId]`) rendrer denne. Gaten gjøres i ruten; komponenten
 * henter snapshot + chrome.
 *
 * Variant-forskjeller: shell (Admin/App), back/generer/slett-href, og at
 * admin kan bore ned i hver match (SmartLink til /admin/games/[id]) mens
 * club-varianten lenker ferdige matcher til kampens leaderboard (#1456) og
 * viser uferdige som rene info-kort.
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
  // Oversettelsene først: navne-fallbacken (#1527) er input til snapshot-en.
  const t = await getTranslations('cup');
  const unknownLabel = t('manage.unknownPlayer');

  const snapshot = await getCupSnapshot(tournamentId, unknownLabel);
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
    player_swapped: t('manage.statusMessages.player_swapped'),
  };
  const errorMessage = errorCode ? errorMessageMap[errorCode] : undefined;
  const statusMessage = statusCode ? statusMessageMap[statusCode] : undefined;

  const chipTone = STATUS_TO_CHIP[tournament.status];
  const statusLabel = t(`status.${tournament.status}`);

  const canStart = tournament.status === 'draft' && leaderboard.matches.length >= 2;
  const showStartHint =
    tournament.status === 'draft' && leaderboard.matches.length < 2;

  // #1501: sidepoeng-gate — «Avslutt cupen» disables til alle konfigurerte
  // sidepoeng er registrert. Samme regel serveren håndhever (ett hjem via
  // `unregisteredSideAwards`), så UI aldri lover noe serveren avviser.
  const unregisteredAwards = unregisteredSideAwards(snapshot.sideAwards);
  const sideAwardsRegistered = unregisteredAwards.length === 0;
  const canFinish = tournament.status === 'active' && sideAwardsRegistered;

  const sideAwardKindLabel = (kind: 'ctp' | 'ld' | 'gir'): string =>
    kind === 'ctp'
      ? t('sideAwards.kindCtp')
      : kind === 'ld'
        ? t('sideAwards.kindLd')
        : t('sideAwards.kindGir');
  const missingAwardsList = unregisteredAwards
    .map(
      (a) =>
        `${sideAwardKindLabel(a.kind)} (${t('sideAwards.holeShort', { n: a.holeNumber })})`,
    )
    .join(', ');

  // #1501: host-kamper som fortsatt er aktive driver leverings-/feil-banneret.
  // Avledede kamper følger verten (source_game_id !== null) og endes aldri
  // eksplisitt, så de holdes utenfor listene.
  const activeHostMatches = leaderboard.matches.filter(
    (m) => (m.sourceGameId ?? null) === null && m.status === 'active',
  );
  const notSubmittedMatchesList = activeHostMatches
    .filter(matchBlocksOneTapFinish)
    .map((m) => m.matchLabel ?? t('matchFallback'))
    .join(', ');
  const failedMatchesList = activeHostMatches
    .map((m) => m.matchLabel ?? t('matchFallback'))
    .join(', ');

  function preferredName(p: CupRosterPlayer): string {
    return p.nickname?.trim() || p.name?.trim() || unknownLabel;
  }

  // #1441 (D9): vinner-dropdownen i SideAwardsPanel trenger navn merket med
  // lag, så arrangøren ser hvem som er hvem uten å bla mellom seksjonene.
  const rosterOptions: SideAwardRosterOption[] = [
    ...roster.team1.map((p) => ({
      userId: p.userId,
      label: `${preferredName(p)} (${tournament.team_1_name})`,
    })),
    ...roster.team2.map((p) => ({
      userId: p.userId,
      label: `${preferredName(p)} (${tournament.team_2_name})`,
    })),
  ];

  const Shell = isClub ? AppShell : AdminShell;
  const backHref = isClub && groupId ? `/klubber/${groupId}` : '/admin/cup';
  const kicker = isClub ? (clubName ?? t('ledger.kicker')) : t('ledger.kicker');
  const ribbonKicker = isClub
    ? t('manage.brassRibbonClub', { status: statusLabel })
    : t('manage.brassRibbonAdmin', { status: statusLabel });
  // Rom-lenker (#1472) deler samme admin/klubb-form. Alle rommene (oppsett,
  // spillere, generer) og slett henger under samme cup.
  const roomHref = (room: string) =>
    isClub && groupId
      ? `/klubber/${groupId}/cup/${tournamentId}/${room}`
      : `/admin/cup/${tournamentId}/${room}`;

  return (
    <Shell>
      <TopBar backHref={backHref} kicker={kicker} />
      <BrassRibbon kicker={ribbonKicker} />
      <PageHeader
        title={tournament.name}
        subtitle={cupHeaderSubtitle(tournament, t)}
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

      {/* Status-kort. Totaler + sidepoeng skjules her og på cup-siden (#1468) —
          resultatet bor på den låste resultatsiden. «X av N matcher spilt»
          består (fremdrift, ikke resultat). To dører: cup-siden og
          resultatsiden (samme låse-oppførsel som for spillerne). */}
      <Card className="mb-5">
        <p className="text-center text-xs text-muted">
          {cupMatchesSummary(tournament, leaderboard, t)}
        </p>
        <div className="mt-3 flex flex-col items-center gap-2">
          <SmartLink
            href={`/cup/${tournamentId}`}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            {t('manage.openCupPage')}
          </SmartLink>
          <SmartLink
            href={`/cup/${tournamentId}/resultater`}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            {t('manage.openResults')}
          </SmartLink>
        </div>
      </Card>

      {/* Lag-roster. Skjules helt til minst én match har gitt lagene spillere —
          to tomme «Ingen spillere»-kort før generering er bare støy
          (eier-tilbakemelding fra staging-runden, #1441). */}
      {(roster.team1.length > 0 || roster.team2.length > 0) && (
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
      )}

      {/* Sidepoeng: ctp/ld/gir-oppsett + registrering etter runden (#1441 D9,
          #1489 slots + GIR — lagnavnene trengs til GIR-teller-feltene) */}
      <SideAwardsPanel
        tournamentId={tournamentId}
        initialAwards={snapshot.sideAwards}
        rosterOptions={rosterOptions}
        team1Name={tournament.team_1_name}
        team2Name={tournament.team_2_name}
        configEditable={tournament.status === 'draft'}
        showWinnerRegistration={tournament.status === 'active' || tournament.status === 'finished'}
      />

      <CupDoorsSection
        tournamentId={tournamentId}
        isDraft={tournament.status === 'draft'}
        isClub={isClub}
        groupId={groupId}
        matchCount={leaderboard.matches.length}
      />

      <CupMatchList
        tournamentId={tournamentId}
        isClub={isClub}
        groupId={groupId}
        matches={leaderboard.matches}
        roster={roster}
        team1Name={tournament.team_1_name}
        team2Name={tournament.team_2_name}
      />

      <CupActionsSection
        tournament={{ id: tournament.id, status: tournament.status }}
        canStart={canStart}
        showStartHint={showStartHint}
        canFinish={canFinish}
        sideAwardsRegistered={sideAwardsRegistered}
        missingAwardsList={missingAwardsList}
        notSubmittedMatchesList={notSubmittedMatchesList}
        failedMatchesList={failedMatchesList}
        errorCode={errorCode}
        deleteHref={roomHref('slett')}
      />
    </Shell>
  );
}
