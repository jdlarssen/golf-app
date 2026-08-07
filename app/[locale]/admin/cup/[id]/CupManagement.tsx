import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
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
import { matchBlocksOneTapFinish } from '@/lib/cup/matchSubmissionStatus';
import { startTournament, finishTournament } from '@/lib/cup/actions';
import { unregisteredSideAwards } from '@/lib/cup/sideAwardsRegistered';
import {
  cupMatchStatusKey,
  CUP_MATCH_STATUS_MESSAGE_KEY,
} from '@/lib/cup/cupMatchStatusLabel';
import { SideAwardsPanel, type SideAwardRosterOption } from './SideAwardsPanel';

export type CupManagementVariant = 'admin' | 'club';

const STATUS_TO_CHIP: Record<'draft' | 'active' | 'finished', StatusChipTone> = {
  draft: 'utkast',
  active: 'aktiv',
  finished: 'signert',
};

function formatPoints(n: number): string {
  return String(n).replace('.', ',');
}

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

type CupDoorData = {
  courseName: string | null;
  teeName: string | null;
  participantCount: number;
};

/**
 * Dør-status-data (#1472): bane/tee-navn fra lagret plan + antall påmeldte.
 * Kun kalt mens cupen er `draft` (dørene vises bare da). Trukket ut av
 * `CupManagement` for å holde komponentens cyclomatic complexity nede — leser
 * fra request-klienten (SELECT-policy tillater authenticated, 0154-mønsteret).
 */
async function fetchCupDoorData(tournamentId: string): Promise<CupDoorData> {
  const supabase = await getServerClient();
  const [{ data: plan }, participantsResult] = await Promise.all([
    supabase
      .from('tournament_plans')
      .select('course_id, tee_box_id')
      .eq('tournament_id', tournamentId)
      .maybeSingle(),
    supabase
      .from('tournament_participants')
      .select('user_id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId),
  ]);

  let courseName: string | null = null;
  let teeName: string | null = null;
  if (plan?.course_id && plan?.tee_box_id) {
    const [{ data: course }, { data: tee }] = await Promise.all([
      supabase.from('courses').select('name').eq('id', plan.course_id).maybeSingle(),
      supabase.from('tee_boxes').select('name').eq('id', plan.tee_box_id).maybeSingle(),
    ]);
    courseName = course?.name ?? null;
    teeName = tee?.name ?? null;
  }

  return {
    courseName,
    teeName,
    participantCount: participantsResult.count ?? 0,
  };
}

/**
 * Én dør fra cup-detaljsiden til et rom (#1472). Hele kortet er lenken
 * (≥44px tap-target); tittel + status-subtitle + chevron-affordance.
 */
function CupDoor({
  href,
  testId,
  title,
  subtitle,
}: {
  href: string;
  testId: string;
  title: string;
  subtitle: string;
}) {
  return (
    <SmartLink
      href={href}
      data-testid={testId}
      className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <Card className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-base text-text">{title}</p>
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 shrink-0 text-muted"
        >
          <path d="M7.5 4.5 13 10l-5.5 5.5" />
        </svg>
      </Card>
    </SmartLink>
  );
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
    .map((m) => m.matchLabel ?? 'Match')
    .join(', ');
  const failedMatchesList = activeHostMatches
    .map((m) => m.matchLabel ?? 'Match')
    .join(', ');

  function preferredName(p: CupRosterPlayer): string {
    return p.nickname?.trim() || p.name?.trim() || t('manage.unknownPlayer');
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

  // #1472: dør-status-data hentes kun mens cupen er draft (dørene vises bare da).
  const isDraft = tournament.status === 'draft';
  const doorData = isDraft ? await fetchCupDoorData(tournamentId) : null;
  const oppsettSubtitle =
    doorData && doorData.courseName && doorData.teeName
      ? t('manage.doors.oppsettSubtitle', {
          course: doorData.courseName,
          tee: doorData.teeName,
        })
      : t('manage.doors.oppsettEmpty');

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

      {/* #1472: tre dører — Oppsett, Spillere, Fordel & generer. Vises kun i
          draft; empty-states håndteres inne i rommene, så dørene er alltid
          klikkbare. */}
      {isDraft && doorData && (
        <section className="mb-5 space-y-3">
          <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('manage.doors.heading')}
          </h2>
          <CupDoor
            href={roomHref('oppsett')}
            testId="cup-door-oppsett"
            title={t('manage.doors.oppsettTitle')}
            subtitle={oppsettSubtitle}
          />
          <CupDoor
            href={roomHref('spillere')}
            testId="cup-door-spillere"
            title={t('manage.doors.spillereTitle')}
            subtitle={t('manage.doors.spillereSubtitle', {
              count: doorData.participantCount,
            })}
          />
          <CupDoor
            href={roomHref('generer')}
            testId="cup-door-generer"
            title={t('manage.doors.genererTitle')}
            subtitle={t('manage.doors.genererSubtitle', {
              count: leaderboard.matches.length,
            })}
          />
        </section>
      )}

      {/* Matches-liste */}
      <section className="mb-5">
        <div className="mb-2">
          <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t('manage.matchesHeading')}
          </h2>
        </div>
        {leaderboard.matches.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              {t('manage.emptyMatches')}
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {leaderboard.matches.map((m) => {
              // Resultater bor på resultatsiden (#1468) — her kun kampene og en
              // nøytral status. Ferdig match viser «Spilt», ikke poeng. #1502:
              // delt status-label gir «Scorekort levert» når alt er levert.
              const statusLabel = t(
                CUP_MATCH_STATUS_MESSAGE_KEY[
                  cupMatchStatusKey({
                    status: m.status,
                    allScorecardsSubmitted: m.allScorecardsSubmitted ?? false,
                  })
                ],
              );
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
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted">{statusLabel}</p>
                    </div>
                  </div>
                </Card>
              );
              // Admin borer ned i full game-admin; klubb-varianten lenker
              // FERDIGE matcher til kampens leaderboard (#1456) — ruta er åpen
              // for alle innloggede først etter finish, så uferdige matcher
              // forblir rene info-kort (ellers 404 for klubb-styrere utenfor
              // kampen).
              const href = isClub
                ? m.status === 'finished'
                  ? `/games/${m.gameId}/leaderboard?from=/klubber/${groupId}/cup/${tournamentId}`
                  : null
                : `/admin/games/${m.gameId}`;
              return (
                <li key={m.gameId}>
                  {href ? <SmartLink href={href}>{card}</SmartLink> : card}
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
          <>
            {/* #1501: sidepoeng-gate — hint navngir hva som mangler; knappen
                er disabled til alt er registrert. */}
            {!sideAwardsRegistered && (
              <Banner tone="info" testId="cup-finish-gate-hint">
                {t('manage.finishSideAwardsHint', { awards: missingAwardsList })}
              </Banner>
            )}

            {/* #1501: uleverte kort — stopp med kampliste + «Avslutt likevel».
                Peer-godkjenning relaxes aldri; likevel-varianten kjører kun
                allowMissing per kamp. */}
            {errorCode === 'matches_not_submitted' && (
              <div className="space-y-3">
                <Banner tone="warning" testId="cup-finish-not-submitted">
                  {t('manage.finishNotSubmitted', { matches: notSubmittedMatchesList })}
                </Banner>
                <form action={finishTournament} data-testid="cup-finish-anyway-form">
                  <input type="hidden" name="id" value={tournament.id} />
                  <input type="hidden" name="allow_missing" value="true" />
                  <SubmitButton
                    className="w-full"
                    variant="secondary"
                    disabled={!sideAwardsRegistered}
                    data-testid="cup-finish-anyway"
                    pendingLabel={t('manage.finishAnywayPending')}
                  >
                    {t('manage.finishAnywayButton')}
                  </SubmitButton>
                </form>
              </div>
            )}

            {/* #1501: en kamp lot seg ikke avslutte — cupen står, re-trykk er
                trygt. Banneret navngir de gjenværende aktive kampene. */}
            {errorCode === 'match_finish_failed' && (
              <Banner tone="error" testId="cup-finish-failed">
                {t('manage.finishFailed', { matches: failedMatchesList })}
              </Banner>
            )}

            <form action={finishTournament} data-testid="cup-finish-form">
              <input type="hidden" name="id" value={tournament.id} />
              <SubmitButton
                className="w-full"
                disabled={!canFinish}
                data-testid="cup-finish-submit"
                pendingLabel={t('manage.finishPending')}
              >
                {t('manage.finishButton')}
              </SubmitButton>
            </form>
          </>
        )}

        <SmartLink
          href={roomHref('slett')}
          className="block text-center text-xs text-danger underline-offset-2 hover:underline pt-2"
        >
          {t('manage.deleteLink')}
        </SmartLink>
      </section>
    </Shell>
  );
}
