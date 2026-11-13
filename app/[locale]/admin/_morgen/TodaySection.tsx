import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { SectionError } from '@/components/ui/SectionError';
import { getActiveRoundsDelivery, liveRoundRows, type LiveRoundRow } from '@/lib/admin/actionItems';
import { scheduledTodayRows } from '@/lib/admin/morningReport';
import { formatTeeOffTimeLocale } from '@/lib/i18n/format';
import type { AppLocale } from '@/i18n/routing';
import { getAdminContext } from '../_dashboardContext';
import { MorningRow, MorningSection, RowCard } from './parts';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * «I dag» (#2345): the rounds in play, then the rounds that tee off today.
 * A scheduled round starts by itself at tee-off (the cron sweep in
 * app/api/cron/start-scheduled-games); one still waiting after its tee-off
 * says so. Every row opens the game.
 */
export async function TodaySection() {
  const { supabase } = await getAdminContext();
  const [t, locale] = await Promise.all([
    getTranslations('admin.dashboard.morning'),
    getLocale(),
  ]);
  const now = new Date();

  // ±24 h is enough to hold every tee-off on today's Oslo date;
  // `scheduledTodayRows` keeps that date.
  const [delivery, scheduledRes] = await Promise.all([
    getActiveRoundsDelivery(),
    supabase
      .from('games')
      .select('id, name, scheduled_tee_off_at')
      .eq('status', 'scheduled')
      .gte('scheduled_tee_off_at', new Date(now.getTime() - DAY_MS).toISOString())
      .lte('scheduled_tee_off_at', new Date(now.getTime() + DAY_MS).toISOString()),
  ]);
  if (!delivery || scheduledRes.error) {
    if (scheduledRes.error) console.error('[admin/morning] scheduled games', scheduledRes.error);
    return <TodayFrame heading={t('todayHeading')}><SectionError testId="morning-today-error" /></TodayFrame>;
  }

  const scheduledGames = scheduledRes.data.flatMap((g) =>
    g.scheduled_tee_off_at
      ? [{ id: g.id, name: g.name, scheduledTeeOffAt: g.scheduled_tee_off_at }]
      : [],
  );
  const playerCounts = new Map<string, number>();
  if (scheduledGames.length > 0) {
    const { data: roster, error } = await supabase
      .from('game_players')
      .select('game_id')
      .in('game_id', scheduledGames.map((g) => g.id))
      .is('withdrawn_at', null);
    if (error) {
      console.error('[admin/morning] scheduled rosters', error);
      return <TodayFrame heading={t('todayHeading')}><SectionError testId="morning-today-error" /></TodayFrame>;
    }
    for (const r of roster) playerCounts.set(r.game_id, (playerCounts.get(r.game_id) ?? 0) + 1);
  }

  const live = liveRoundRows(delivery.games, delivery.players);
  const scheduled = scheduledTodayRows(scheduledGames, playerCounts, now);

  const liveLine = (row: LiveRoundRow) =>
    row.state === 'playing'
      ? t('todayPlaying', { count: row.playerCount, hole: row.hole ?? 0 })
      : row.state === 'done'
        ? t('todayDone', { count: row.playerCount })
        : t('todayNone', { count: row.playerCount });

  return (
    <TodayFrame heading={t('todayHeading')}>
      {live.length + scheduled.length === 0 ? (
        <p className="text-[13px] text-muted">{t('todayEmpty')}</p>
      ) : (
        <RowCard>
          {live.map((row) => (
            <MorningRow
              key={row.gameId}
              href={`/admin/games/${row.gameId}`}
              testId="morning-today-live"
              minHeight="min-h-[52px]"
              name={row.name}
              line={liveLine(row)}
              trail={<LivePill label={t('todayLive')} />}
            />
          ))}
          {scheduled.map((row) => (
            <MorningRow
              key={row.gameId}
              href={`/admin/games/${row.gameId}`}
              testId={row.late ? 'morning-today-late' : 'morning-today-scheduled'}
              minHeight="min-h-[52px]"
              name={row.name}
              line={
                row.late ? (
                  <span className="text-warning-text">{t('todayLate')}</span>
                ) : (
                  t('todayScheduled', { count: row.playerCount })
                )
              }
              trail={
                <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
                  {formatTeeOffTimeLocale(new Date(row.teeOffAt), locale as AppLocale)}
                </span>
              }
            />
          ))}
        </RowCard>
      )}
    </TodayFrame>
  );
}

function TodayFrame({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <MorningSection id="morning-today" heading={heading}>
      {children}
    </MorningSection>
  );
}

/** «Live» as drawn: a green dot in a pale green pill, sentence case (#2728). */
function LivePill({ label }: { label: string }) {
  return (
    <span className="flex h-[22px] shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-2 text-xs font-semibold text-primary">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-live-dot" />
      {label}
    </span>
  );
}
