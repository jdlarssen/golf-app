import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { formatTeeOffDateLocale, formatTeeOffTimeLocale } from '@/lib/i18n/format';
import { localizeGameName } from '@/lib/games/autoGameName';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { Card } from '@/components/ui/Card';
import { Kicker } from '@/components/ui/Kicker';
import { SmartLink } from '@/components/ui/SmartLink';
import type { GameRow } from './gameHomeSelect';
import { CreatorControls } from './CreatorControls';
import { FinishGameCard } from './FinishGameCard';
import { LiveFollowControl } from './LiveFollowControl';
import { CupStandingsLink } from './CupStandingsLink';

/**
 * `/games/[id]` for the organiser who is not on the roster (#2202). Every
 * organiser flow lands on the game page (publish, finish, edit, delete, the
 * back arrow from «Styr spillere», Klubbhuset, notifications), so this view
 * shows what the organiser needs for the game's status instead of a 404.
 *
 * Nothing here assumes the viewer plays: no score entry, no payment box, no
 * waiting room, and no auto-start (the organiser has «Start runden nå», and
 * the cron sweep starts the round anyway). The live leaderboard stays closed
 * during play, as RLS keeps scores to participants (#1542); the organiser
 * follows the round through «Følg live».
 */
export async function OrganiserGameView({
  id,
  game,
  locale,
  spectateToken,
  errorBanner,
}: {
  id: string;
  game: GameRow;
  locale: AppLocale;
  spectateToken: string | null;
  errorBanner: ReactNode;
}) {
  const t = await getTranslations('game.home');
  const gameName = localizeGameName(game.name, game.courses?.name ?? null, locale);
  const teeOffDate =
    game.status === 'scheduled' && game.scheduled_tee_off_at
      ? new Date(game.scheduled_tee_off_at)
      : null;

  return (
    <AppShell>
      <div data-testid="organiser-view">
        <TopBar backHref="/" backLabel={t('backToHome')} kicker={t('tournamentKicker')} />
        <PageHeader title={gameName} />

        <div className="mb-4">
          <StatusChip status={game.status} />
        </div>

        {errorBanner}

        <p className="mb-4 text-sm text-muted" data-testid="organiser-view-hint">
          {t('organiserViewHint')}
        </p>

        <div className="space-y-4">
          <Card>
            <div className="flex justify-between items-baseline gap-4">
              <div className="min-w-0">
                <Kicker tone="muted">{t('courseLabel')}</Kicker>
                <p className="mt-1 font-serif text-[19px] font-medium tracking-[-0.01em] text-text truncate">
                  {game.courses?.name ?? t('unknownCourse')}
                </p>
              </div>
              {game.status === 'scheduled' && (
                <div className="text-right shrink-0">
                  <Kicker tone="muted">{t('teeOffLabel')}</Kicker>
                  {teeOffDate ? (
                    <>
                      <p className="mt-1 font-serif text-[22px] font-semibold tracking-[-0.02em] text-text tabular-nums">
                        {formatTeeOffTimeLocale(teeOffDate, locale)}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        {formatTeeOffDateLocale(teeOffDate, locale)}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted">{t('teeOffNotSet')}</p>
                  )}
                </div>
              )}
            </div>
          </Card>

          {game.status === 'active' && (
            <>
              <FinishGameCard gameId={id} />
              <LiveFollowControl
                gameId={id}
                spectateToken={spectateToken}
                locale={locale}
                gameName={gameName}
              />
            </>
          )}

          {game.status === 'finished' && (
            <SmartLink href={`/games/${id}/leaderboard`} className="block">
              <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
                <span className="text-base font-medium text-text">{t('leaderboard')}</span>
                <span aria-hidden className="text-muted">
                  →
                </span>
              </Card>
            </SmartLink>
          )}

          {/* Self-gates on status: draft and scheduled get edit/delete,
              scheduled and active «Styr spillere», scheduled the start. */}
          <CreatorControls gameId={id} status={game.status} />

          <Suspense fallback={null}>
            <CupStandingsLink gameId={id} />
          </Suspense>

          <div className="pt-2">
            <SmartLink
              href="/"
              className="flex min-h-[44px] items-center justify-center text-center text-sm text-muted hover:text-text transition-colors"
            >
              {t('backToHome')}
            </SmartLink>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
