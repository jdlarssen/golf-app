import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { getServerClient } from '@/lib/supabase/server';
import { formatNumber } from '@/lib/i18n/format';
import { leagueCardAccess, loadLeagueCard } from '@/lib/league/leagueCardAccess';
import { isPointsBasedFormat } from '@/lib/league/flightFormat';
import { formatRoundCell } from '@/lib/league/standingsFormat';
import { isUuid } from '@/lib/url/isUuid';
import { ScorecardTable } from '@/app/[locale]/games/[id]/_components/ScorecardTable';

type Params = Promise<{ id: string; gameId: string; userId: string }>;

/**
 * The card behind a cell in the season table (#2815): a tap on a player's
 * result for a round opens their card for it, read-only. A league mate is
 * usually not in the flight, so the card is read with the service role
 * behind `leagueCardAccess`: whoever may see the league sees a card the table
 * counts; anyone else gets a 404, as if it did not exist.
 *
 * The card is on the table's axis (net, or gross in a gross league): the
 * strokes, the net strokes or the points per hole, and the playing handicap
 * on top. The result is the number in the cell, from the same scoring.
 */
export default async function LeagueCardPage({ params }: { params: Params }) {
  const { id: leagueId, gameId, userId: playerUserId } = await params;
  const [t, locale] = await Promise.all([getTranslations('liga.card'), getLocale() as Promise<AppLocale>]);

  const viewerId = await getProxyVerifiedUserId();
  if (!viewerId) redirect({ href: '/login', locale });
  if (![leagueId, gameId, playerUserId].every(isUuid)) notFound();

  const access = await leagueCardAccess(await getServerClient(), {
    callerId: viewerId,
    leagueId,
    gameId,
    playerUserId,
  });
  if (!access.ok) notFound();
  const loaded = await loadLeagueCard(access);
  if (!loaded) notFound();

  const { card, holes, teeGender } = loaded;
  const name = card.player.name ?? t('unknownPlayer');
  const pointsBased = isPointsBasedFormat(card.format);
  const decimal = (value: number, decimals: number) =>
    formatNumber(value, locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  // The round's own value, as the table writes a round (never the placement
  // points of the 'points' model: those are not on the card).
  const value = formatRoundCell(card.value, 'total', pointsBased, decimal);
  const cells = card.grid.halves.flatMap((half) => half.cells);
  const strokes = new Map(cells.map((cell) => [cell.holeNumber, cell.strokes]));
  // Points per hole in stableford; the net strokes in stroke play on the net
  // axis; nothing more on a gross stroke-play card.
  const extraColumn = pointsBased
    ? { label: t('colPoints'), values: new Map(cells.map((cell) => [cell.holeNumber, cell.points])) }
    : card.axis === 'net'
      ? { label: t('colNet'), values: new Map(cells.map((cell) => [cell.holeNumber, cell.net])) }
      : undefined;
  const facts = [
    card.playingHandicap !== null ? t('playingHandicap', { hcp: card.playingHandicap }) : null,
    t('gross', { value: card.grid.totals.brutto }),
    !pointsBased && card.axis === 'net' && card.grid.totals.netto !== null
      ? t('net', { value: card.grid.totals.netto })
      : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <AppShell>
      <TopBar backHref={`/liga/${leagueId}`} kicker={t('kicker')} />

      <header className="mb-5">
        <h1 className="font-serif text-2xl leading-tight tracking-[-0.015em] text-text">
          {t('heading', { name })}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {t('subtitle', { roundLabel: card.roundLabel, leagueName: card.leagueName })}
        </p>
      </header>

      <Card className="overflow-hidden p-0" data-testid="league-card">
        <div className="border-b border-border px-4 py-3">
          <p className="font-serif text-base font-medium text-text" data-testid="league-card-result">
            {pointsBased ? t('resultPoints', { value }) : t('result', { value })}
          </p>
          <p className="mt-0.5 text-xs text-muted tabular-nums">{facts.join(' · ')}</p>
        </div>
        <div className="px-4 py-3">
          <ScorecardTable
            holes={holes}
            scores={strokes}
            teeGender={teeGender}
            holeSegment="full"
            extraColumn={extraColumn}
          />
        </div>
      </Card>
    </AppShell>
  );
}
