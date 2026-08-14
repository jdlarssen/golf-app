import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { canViewCupPage } from '@/lib/cup/cupPageAccess';
import { isTeamMatchGameMode } from '@/lib/cup/computeCupLeaderboard';
import { computeCupPlayerPoints } from '@/lib/cup/computeCupPlayerPoints';
import { computeCupMvp, computeCupUnderperformer } from '@/lib/cup/computeCupAwards';
import { formatPoints } from '@/lib/cup/formatPoints';
import { CupPlayerPoints } from './CupPlayerPoints';
import { CupAwards } from './CupAwards';

type Params = Promise<{ id: string }>;

const GOLD_CARD_STYLE = {
  background: 'linear-gradient(180deg, rgba(201, 169, 97, 0.12), rgba(201, 169, 97, 0.04))',
  borderColor: 'rgba(201, 169, 97, 0.45)',
  borderWidth: '1px',
  borderStyle: 'solid',
} as const;

/**
 * Cup-resultatside (#1468). Låst for ALLE — inkludert arrangør og global admin —
 * til cupen er avsluttet (`tournaments.status = 'finished'`); før det en
 * forklarende ventetekst, aldri en død flate (#752). Etter finish er dette i
 * praksis den gamle cup-siden: vinner-banner, lagtotaler, sidepoeng og
 * matchresultater. Ren presentasjon — snapshot-en/beregningen røres ikke.
 */
export default async function CupResultsPage({ params }: { params: Params }) {
  const { id } = await params;
  const [userId, t] = await Promise.all([
    getProxyVerifiedUserId(),
    getTranslations('cup'),
  ]);
  // Navne-fallbacken (#1527) mates inn i alt som bygger visnings-navn her:
  // snapshot-en, poengregnskapet og «dro ned mest»-kåringen.
  const unknownLabel = t('manage.unknownPlayer');

  const snapshot = await getCupSnapshot(id, unknownLabel);
  if (!snapshot) notFound();

  const { tournament, leaderboard, sideAwards, performanceInputs } = snapshot;

  // Samme klubb-gate som cup-siden (#524, delt helper #1468).
  const allowed = await canViewCupPage({
    groupId: tournament.group_id,
    roster: snapshot.roster,
    proxyUserId: userId,
  });
  if (!allowed) notFound();

  const matchesSummary = t('public.matchesSummary', {
    finished: leaderboard.finishedMatches,
    total: leaderboard.matches.length,
  });

  // Låst: cupen er ikke avsluttet ennå. Ventetekst + fremdrift, ingen resultat.
  if (tournament.status !== 'finished') {
    return (
      <AppShell>
        <TopBar backHref={`/cup/${id}`} kicker={t('results.kicker')} />
        <header className="mb-6 text-center">
          <h1 className="font-serif text-3xl text-text leading-tight tracking-[-0.015em]">
            {tournament.name}
          </h1>
        </header>
        <Card data-testid="cup-results-locked">
          <p className="text-sm text-text">{t('results.lockedBody')}</p>
          <p className="mt-2 text-xs text-muted tabular-nums">{matchesSummary}</p>
        </Card>
      </AppShell>
    );
  }

  const winnerName =
    leaderboard.winner === 1
      ? tournament.team_1_name
      : leaderboard.winner === 2
        ? tournament.team_2_name
        : null;

  // Per-spiller-poengregnskap (#1497): kamppoeng (full kreditt per spiller) +
  // ctp/ld-sidepoeng, aggregert fra samme snapshot. Kun lag med spillere vises.
  const playerPoints = computeCupPlayerPoints({
    matches: leaderboard.matches,
    roster: snapshot.roster,
    sideAwards,
    unknownLabel,
  });
  const playerPointGroups = [
    { team: 1 as const, teamName: tournament.team_1_name, rows: playerPoints.team1 },
    { team: 2 as const, teamName: tournament.team_2_name, rows: playerPoints.team2 },
  ].filter((g) => g.rows.length > 0);

  // Seremonikåringene (#1508): MVP fra samme poengregnskap, «dro ned mest» fra
  // prestasjons-inputen. Begge kan være null — da vises de ikke.
  const mvp = computeCupMvp(playerPoints);
  const underperformer = computeCupUnderperformer({
    games: performanceInputs,
    roster: snapshot.roster,
    unknownLabel,
  });

  return (
    <AppShell>
      <TopBar backHref={`/cup/${id}`} kicker={t('results.kicker')} />

      <header className="mb-6 text-center">
        <h1 className="font-serif text-3xl text-text leading-tight tracking-[-0.015em]">
          {tournament.name}
        </h1>
        {winnerName ? (
          <p className="mt-2 text-sm font-medium" style={{ color: 'var(--accent)' }}>
            {t('results.winner', { team: winnerName })}
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">{t('results.tied')}</p>
        )}
      </header>

      {/* Lag-points stort + sentralt */}
      <section className="mb-8" data-testid="cup-results-totals">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div
            className={
              leaderboard.winner === 1 ? 'rounded-2xl p-5' : 'rounded-2xl border border-border bg-surface p-5'
            }
            style={leaderboard.winner === 1 ? GOLD_CARD_STYLE : undefined}
          >
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {tournament.team_1_name}
            </p>
            <p className="font-serif text-5xl tabular-nums text-primary mt-2">
              {formatPoints(leaderboard.team1Points)}
            </p>
          </div>
          <div
            className={
              leaderboard.winner === 2 ? 'rounded-2xl p-5' : 'rounded-2xl border border-border bg-surface p-5'
            }
            style={leaderboard.winner === 2 ? GOLD_CARD_STYLE : undefined}
          >
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {tournament.team_2_name}
            </p>
            <p className="font-serif text-5xl tabular-nums text-primary mt-2">
              {formatPoints(leaderboard.team2Points)}
            </p>
          </div>
        </div>
        <p className="text-center text-xs text-muted mt-3">{matchesSummary}</p>
        {sideAwards.length > 0 && (
          <p
            className="text-center text-xs text-muted mt-1 tabular-nums"
            data-testid="cup-side-award-points"
          >
            {t('public.sideAwardPoints', {
              points: `${formatPoints(leaderboard.sideAwardPoints.team1)}–${formatPoints(leaderboard.sideAwardPoints.team2)}`,
            })}
          </p>
        )}
      </section>

      {/* Kåringer (#1508) — rett etter lagtotalene, før spillerpoengene. */}
      <CupAwards mvp={mvp} underperformer={underperformer} />

      {/* Per-spiller-poengregnskap (#1497) — mellom lagtotalene og kamplisten. */}
      {playerPointGroups.length > 0 && (
        <CupPlayerPoints groups={playerPointGroups} currentUserId={userId} />
      )}

      {/* Matches-liste med resultater. Hvert kort lenker til kampens eget
          leaderboard (#1456). */}
      <section>
        <h2 className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-muted mb-2">
          {t('manage.matchesHeading')}
        </h2>
        {leaderboard.matches.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">{t('public.noMatches')}</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {leaderboard.matches.map((m) => {
              const isFinishedMatch = m.status === 'finished';
              const isActive = m.status === 'active';
              const scoreLabel = isFinishedMatch
                ? `${formatPoints(m.pointsTeam1)}–${formatPoints(m.pointsTeam2)}`
                : isActive
                  ? t('public.matchInProgress')
                  : t('public.matchDraft');
              const card = (
                <Card
                  className={
                    isFinishedMatch
                      ? 'transition-colors hover:border-primary/30'
                      : undefined
                  }
                >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                            {m.matchLabel ?? t('matchFallback')}
                          </p>
                          <p className="font-serif text-base text-text mt-1">
                            {m.team1PlayerName}{' '}
                            <span className="text-muted">{t('manage.mot')}</span>{' '}
                            {m.team2PlayerName}
                          </p>
                          {m.result && (
                            <p className="text-xs text-muted mt-1">
                              {m.result.winnerSide === 'tied'
                                ? t('results.matchTied')
                                : t('results.resultTo', {
                                    result: m.result.formatted,
                                    name:
                                      m.result.winnerSide === 1
                                        ? isTeamMatchGameMode(m.gameMode)
                                          ? tournament.team_1_name
                                          : m.team1PlayerName
                                        : isTeamMatchGameMode(m.gameMode)
                                          ? tournament.team_2_name
                                          : m.team2PlayerName,
                                  })}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-serif text-lg tabular-nums text-primary">{scoreLabel}</p>
                        </div>
                      </div>
                    </Card>
              );
              // Kun ferdige kamper lenker til kamp-leaderboardet (#1456) —
              // ruta er åpen for alle innloggede først etter finish, og en
              // tvangsavsluttet cup kan ha uferdige kamper igjen.
              return (
                <li key={m.gameId}>
                  {isFinishedMatch ? (
                    <SmartLink
                      href={`/games/${m.gameId}/leaderboard?from=/cup/${id}/resultater`}
                      className="block"
                    >
                      {card}
                    </SmartLink>
                  ) : (
                    card
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
