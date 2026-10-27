import { first } from '@/lib/url/searchParams';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Banner';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { markReadOnVisit } from '@/lib/notifications/markRead';
import { markerReviewAccess, loadMarkerCard } from '@/lib/league/markerReviewAccess';
import { ScorecardTable } from '@/app/[locale]/games/[id]/_components/ScorecardTable';
import { ReviewActions } from '@/app/[locale]/games/[id]/approve/ReviewActions';
import { approveAsMarker, rejectAsMarker } from './actions';

type Params = Promise<{ id: string; gameId: string; userId: string }>;
type SearchParams = Promise<{ status?: string | string[]; error?: string | string[] }>;

const STATUS_KEYS = ['approved', 'approved_waiting', 'rejected'] as const;
const ERROR_KEYS = ['forbidden', 'not_pending', 'db'] as const;

/**
 * The marker's page for one card in a simulator-league flight (#2661). The
 * `league_marker_request` notice links here. The marker is usually not in the
 * flight, so the card is read with the service role behind
 * `markerReviewAccess`: the named marker, the league's organiser or a global
 * admin see it; anyone else gets a 404, as if it did not exist.
 *
 * Read-only: the same scorecard table and the same «Godkjenn» / «Avvis» as
 * /games/[id]/approve. The marker cannot change a stroke; a card sent back
 * opens again for the player, who puts it right and delivers again.
 */
export default async function LeagueMarkerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id: leagueId, gameId, userId: playerUserId } = await params;
  const sp = await searchParams;
  const [t, tApprove, locale] = await Promise.all([
    getTranslations('liga.marker'),
    getTranslations('game.approve'),
    getLocale(),
  ]);

  const viewerId = await getProxyVerifiedUserId();
  if (!viewerId) redirect({ href: '/login', locale });

  // Opening the page reads the marker's notice for the game (#2201), before
  // the gate like every caller of markReadOnVisit.
  after(() => markReadOnVisit({ userId: viewerId, surface: 'leagueMarker', entityId: gameId }));

  const review = await markerReviewAccess(viewerId, gameId, playerUserId);
  if (!review.ok || review.flight.leagueId !== leagueId) notFound();

  const card = await loadMarkerCard(review);
  const played = card.holes
    .map((h) => card.strokes.get(h.hole_number) ?? null)
    .filter((v): v is number => v != null);
  const total = played.reduce((sum, n) => sum + n, 0);
  const name = review.card.name ?? t('unknownPlayer');

  const statusKey = STATUS_KEYS.find((k) => k === first(sp.status));
  const errorKey = ERROR_KEYS.find((k) => k === first(sp.error));

  return (
    <AppShell>
      <TopBar backHref={`/liga/${leagueId}`} kicker={t('kicker')} />

      <header className="mb-5">
        <h1 className="font-serif text-2xl leading-tight tracking-[-0.015em] text-text">
          {t('heading', { name })}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t('subtitle', { roundLabel: review.flight.roundLabel, leagueName: review.flight.leagueName })}
        </p>
      </header>

      <div className="space-y-4">
        {statusKey && <Banner tone="success">{t(`banners.${statusKey}`)}</Banner>}
        {errorKey && <Banner tone="error">{t(`errors.${errorKey}`)}</Banner>}
        {review.role === 'organizer' && review.state === 'pending' && (
          <Banner tone="info" testId="marker-organizer-note">
            {review.card.markerName
              ? t('organizerNote', { markerName: review.card.markerName })
              : t('organizerNoteNoMarker')}
          </Banner>
        )}

        <Card className="overflow-hidden p-0" data-testid="marker-card">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate font-serif text-base font-medium text-text">{name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {tApprove('brutto')} <span className="score-num">{total}</span> · {tApprove('playedHoles')}{' '}
              <span className="score-num">{played.length}</span>
              <span className="inline-num">/{card.holes.length}</span>
            </p>
          </div>
          <div className="border-b border-border px-4 py-3">
            <ScorecardTable
              holes={card.holes}
              scores={card.strokes}
              teeGender={review.card.teeGender}
              holeSegment={review.game.holeSegment}
            />
          </div>
          <div className="px-4 py-3">
            {review.state === 'pending' ? (
              <>
                <p className="mb-3 text-sm text-muted">{t('intro')}</p>
                <ReviewActions
                  playerUserId={playerUserId}
                  playerName={name}
                  approveAction={approveAsMarker.bind(null, leagueId, gameId, playerUserId)}
                  rejectAction={rejectAsMarker.bind(null, leagueId, gameId)}
                />
              </>
            ) : (
              <p className="text-sm text-muted" data-testid={`marker-state-${review.state}`}>
                {t(`state.${review.state}`)}
              </p>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
