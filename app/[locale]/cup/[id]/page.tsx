import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { canViewCupPage } from '@/lib/cup/cupPageAccess';
import {
  cupMatchStatusKey,
  CUP_MATCH_STATUS_MESSAGE_KEY,
} from '@/lib/cup/cupMatchStatusLabel';
import { formatPoints } from '@/lib/cup/formatPoints';

type Params = Promise<{ id: string }>;

/**
 * Header-copyen for poengmålet (#1441, D8) — egen funksjon (ikke inline i
 * komponenten) for å holde `PublicCupPage`s cyclomatic complexity nede; disse
 * tre grenene tilhører logisk sammen uansett.
 */
function pointsHeaderCopy(
  tournament: { points_to_win: number | null; status: 'draft' | 'active' | 'finished' },
  t: Awaited<ReturnType<typeof getTranslations<'cup'>>>,
): string {
  if (tournament.points_to_win !== null) {
    return t('public.firstTo', { points: formatPoints(tournament.points_to_win) });
  }
  return tournament.status === 'active' ? t('public.pointsPendingActive') : t('public.pointsPendingDraft');
}

export default async function PublicCupPage({ params }: { params: Params }) {
  const { id } = await params;
  const [userId, t] = await Promise.all([
    getProxyVerifiedUserId(),
    getTranslations('cup'),
  ]);
  const snapshot = await getCupSnapshot(id, t('manage.unknownPlayer'));
  if (!snapshot) notFound();

  const { tournament, leaderboard, roster } = snapshot;

  // #524: en klubb-scopet cup er kun synlig for klubbens medlemmer, deltakerne
  // og global admin. Gaten (ikke RLS) ligger i den delte helperen (#1468).
  const allowed = await canViewCupPage({
    tournamentId: id,
    groupId: tournament.group_id,
    roster,
    proxyUserId: userId,
  });
  if (!allowed) notFound();

  const isFinished = tournament.status === 'finished';

  return (
    <AppShell>
      <TopBar backHref="/" back="history" kicker="Cup" />

      <header className="mb-6 text-center">
        <h1 className="font-serif text-3xl text-text leading-tight tracking-[-0.015em]">
          {tournament.name}
        </h1>
        {!isFinished ? (
          <p className="mt-2 text-sm text-muted">{pointsHeaderCopy(tournament, t)}</p>
        ) : tournament.points_to_win !== null ? (
          <p className="mt-2 text-sm text-muted">
            {t('public.firstTo', { points: formatPoints(tournament.points_to_win) })}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted tabular-nums">
          {t('public.matchesSummary', {
            finished: leaderboard.finishedMatches,
            total: leaderboard.matches.length,
          })}
        </p>
      </header>

      {/* Dør til resultatsiden (#1468). Etter finish et tydelig dør-kort; før
          finish en dempet linje som fortsatt lenker dit (låst ventetekst) — én
          dør per rom, aldri en død flate. */}
      {isFinished ? (
        <SmartLink
          href={`/cup/${id}/resultater`}
          data-testid="cup-results-door"
          className="block mb-6"
        >
          <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
            <span className="text-base font-medium text-text">{t('public.resultsDoor')}</span>
            <span aria-hidden className="text-muted">
              →
            </span>
          </Card>
        </SmartLink>
      ) : (
        <p className="mb-6 text-center text-xs text-muted">
          <SmartLink
            href={`/cup/${id}/resultater`}
            data-testid="cup-results-pending"
            className="underline-offset-2 hover:underline"
          >
            {t('public.resultsPending')}
          </SmartLink>
        </p>
      )}

      {/* Matches-liste — kampene uten resultater (#1468). Hvert kort lenker til
          kampens eget leaderboard (#1456). */}
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
              // #1502: delt status-label — «Scorekort levert» når alle ikke-
              // trukne har levert og kampen er aktiv, ellers Spilt/Pågår/Utkast.
              const statusLabel = t(
                CUP_MATCH_STATUS_MESSAGE_KEY[
                  cupMatchStatusKey({
                    status: m.status,
                    allScorecardsSubmitted: m.allScorecardsSubmitted ?? false,
                  })
                ],
              );
              const card = (
                <Card
                  className={
                    m.status === 'finished'
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
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted">{statusLabel}</p>
                    </div>
                  </div>
                </Card>
              );
              // Kun ferdige kamper lenker til kamp-leaderboardet (#1456):
              // leaderboard-ruta er åpen for alle innloggede først etter
              // finish — en lenke på en pågående kamp ville 404-et for alle
              // utenfor kampen.
              return (
                <li key={m.gameId}>
                  {m.status === 'finished' ? (
                    <SmartLink
                      href={`/games/${m.gameId}/leaderboard?from=/cup/${id}`}
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
