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
import { GameStartListener } from '../GameStartListener';
import { nonPlayerGameDoor } from '@/lib/games/nonPlayerGameDoor';

/**
 * `/games/[id]` for the organiser who is not on the roster (#2202). Every
 * organiser flow lands on the game page (publish, finish, edit, delete, the
 * back arrow from «Styr spillere», Klubbhuset, notifications), so this view
 * shows what the organiser needs for the game's status instead of a 404.
 *
 * Nothing here assumes the viewer plays: no score entry, no payment box, no
 * waiting room, and no auto-start (the organiser has «Start runden nå», and
 * the cron sweep starts the round anyway). While the round runs the
 * organiser follows it on the leaderboard (owner's choice C), and «Følg live»
 * stays for sharing it with others.
 */
export async function OrganiserGameView({
  id,
  game,
  locale,
  spectateToken,
  errorBanner,
  statusBanner,
  startBlockNotice = null,
}: {
  id: string;
  game: GameRow;
  locale: AppLocale;
  spectateToken: string | null;
  errorBanner: ReactNode;
  statusBanner: ReactNode;
  /** #2204: why a scheduled round would not start, shown over the controls. */
  startBlockNotice?: ReactNode;
}) {
  const t = await getTranslations('game.home');
  const gameName = localizeGameName(game.name, game.courses?.name ?? null, locale);
  // The board door decides when the organiser gets the link: once the round
  // runs (#2202, owner's choice C) and after it. «Følg live» stays for sharing
  // the round with others.
  const boardOpen =
    nonPlayerGameDoor({ gameId: id, isAdmin: false, isCreator: true, surface: 'board', status: game.status })
      .kind === 'board';
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
        {statusBanner}

        {/* A start by the cron sweep, another tab or the app flips the page
            without a reload, so «Start runden nå» never answers not_scheduled
            on a round that is already running (#2219's listener). */}
        {game.status === 'scheduled' && <GameStartListener gameId={id} />}

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

          {boardOpen && (
            <SmartLink href={`/games/${id}/leaderboard`} className="block">
              <Card className="min-h-[44px] flex items-center justify-between transition-colors hover:border-primary/30">
                <span className="text-base font-medium text-text">{t('leaderboard')}</span>
                <span aria-hidden className="text-muted">
                  →
                </span>
              </Card>
            </SmartLink>
          )}

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

          {/* Self-gates on status: draft and scheduled get edit/delete,
              scheduled and active «Styr spillere», scheduled the start. */}
          {startBlockNotice}
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
