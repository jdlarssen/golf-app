import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { first } from '@/lib/url/searchParams';
import { AppShell } from '@/components/ui/AppShell';
import { Banner } from '@/components/ui/Banner';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import { canViewCupPage } from '@/lib/cup/cupPageAccess';
import {
  cupMatchStatusKey,
  cupMatchStatusValues,
  CUP_MATCH_STATUS_MESSAGE_KEY,
} from '@/lib/cup/cupMatchStatusLabel';
import { formatPoints } from '@/lib/cup/formatPoints';
import { CupLineupSpotlight } from './CupLineupSpotlight';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ status?: string | string[] }>;

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

export default async function PublicCupPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
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

  // #1814: navnene bak «{navn} trakk seg» på matchkortene, og døra ut for
  // spilleren selv. Lenka vises kun mens cupen er i gang, kun til deltakere som
  // faktisk har en kamp igjen som ikke har startet — er alt i gang eller
  // ferdigspilt, er det ingenting å trekke seg fra.
  const rosterNames = new Map(
    [...roster.team1, ...roster.team2].map((p) => [
      p.userId,
      p.nickname?.trim() || p.name?.trim() || t('manage.unknownPlayer'),
    ]),
  );
  const myPendingMatches =
    userId !== null &&
    tournament.status === 'active' &&
    leaderboard.matches.some(
      (m) =>
        (m.status === 'draft' || m.status === 'scheduled') &&
        m.withdrawal == null &&
        [...(m.team1UserIds ?? []), ...(m.team2UserIds ?? [])].includes(userId),
    );

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

      {/* #1814: kvittering etter et selv-trekk. Spilleren blir stående på
          laget sitt, så uten denne linja ser siden nøyaktig ut som før. */}
      {first(sp.status) === 'withdrawn' && (
        <div className="mb-4">
          <Banner tone="success">{t('public.withdrawnBanner')}</Banner>
        </div>
      )}

      {/* #1884: avdekkings-kortet og kapteinens vei inn til uttaket. Rendrer
          ingenting for cuper uten uttaks-økter. */}
      <CupLineupSpotlight tournamentId={id} groupId={tournament.group_id} />

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
              // #1814: en kamp avgjort ved trekk står fortsatt `scheduled` —
              // status-nøkkelen er det eneste som skiller den fra «Utkast».
              const statusKey = cupMatchStatusKey({
                status: m.status,
                allScorecardsSubmitted: m.allScorecardsSubmitted ?? false,
                withdrawal: m.withdrawal,
              });
              const statusLabel = t(
                CUP_MATCH_STATUS_MESSAGE_KEY[statusKey],
                cupMatchStatusValues(m, {
                  nameOf: (uid) => rosterNames.get(uid) ?? t('manage.unknownPlayer'),
                  team1Name: tournament.team_1_name,
                  team2Name: tournament.team_2_name,
                }),
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
                      {/* #1814: uten denne linja ser én ball mot to ut som feil. */}
                      {m.soloPlayOn && (
                        <p className="mt-1 font-sans text-[12px] text-muted">
                          {t('public.matchSoloPlayOn', {
                            partner: m.soloPlayOn.partnerName,
                          })}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {/* #1488 (K9) / #1814: `data-status` bærer den språk-
                          uavhengige nøkkelen så e2e kan asserte «avgjort ved
                          trekk» uten å lese norsk copy — samme form som
                          admin-kortet i `CupMatchList`. */}
                      <p
                        className="text-xs text-muted"
                        data-testid={`cup-public-match-status-${m.gameId}`}
                        data-status={statusKey}
                      >
                        {statusLabel}
                      </p>
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

      {/* #1814: dempet dør ut for spilleren selv (E7). Bekreftelsessiden viser
          hva som skjer med hver enkelt kamp før noe skrives. */}
      {myPendingMatches && (
        <div className="pt-4 pb-2">
          <SmartLink
            href={`/cup/${id}/trekk`}
            data-testid="cup-withdraw-self-link"
            className="block text-center text-xs text-muted underline underline-offset-2 decoration-muted/40 transition-colors hover:text-text"
          >
            {t('public.withdrawSelfLink')}
          </SmartLink>
        </div>
      )}
    </AppShell>
  );
}
