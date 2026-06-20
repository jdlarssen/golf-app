import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { SmartLink } from '@/components/ui/SmartLink';
import { formatTeeOffDateLocale } from '@/lib/i18n/format';
import { localizeGameName } from '@/lib/games/autoGameName';
import type { AppLocale } from '@/i18n/routing';

type GameRow = {
  id: string;
  name: string;
  scheduled_tee_off_at: string | null;
  ended_at: string | null;
  // #624 — banenavn for re-lokalisering av auto-genererte spillnavn.
  courses: { name: string } | null;
};

type ScoreRow = {
  game_id: string;
  strokes: number | null;
};

type GameWithStats = GameRow & {
  bruttoSum: number | null;
  holeCount: number;
};

export default async function HistorikkPage() {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('profile.historikk');
  const userIdRaw = await getProxyVerifiedUserId();
  if (!userIdRaw) redirect({ href: '/login', locale });
  const userId = userIdRaw as string; // guarded non-null above (redirect isn't typed `never`)

  const supabase = await getServerClient();

  // Round-trip 1: fetch all finished games the user participated in.
  const { data: gamePlayers, error: gpError } = await supabase
    .from('game_players')
    .select('game_id, games!inner(id, name, scheduled_tee_off_at, ended_at, courses(name))')
    .eq('user_id', userId)
    .eq('games.status', 'finished')
    .order('games(scheduled_tee_off_at)', { ascending: false });

  if (gpError) throw gpError;

  const rows = (gamePlayers ?? []) as unknown as Array<{
    game_id: string;
    games: GameRow;
  }>;

  const gameIds = rows.map((r) => r.game_id);

  // Round-trip 2: fetch all user scores for those games in one IN query.
  const scoresByGame: Map<string, ScoreRow[]> = new Map();
  if (gameIds.length > 0) {
    const { data: scores, error: scoresError } = await supabase
      .from('scores')
      .select('game_id, strokes')
      .eq('user_id', userId) // userId is string — narrowed after redirect guard above
      .in('game_id', gameIds)
      .not('strokes', 'is', null);

    if (scoresError) throw scoresError;

    for (const score of scores ?? []) {
      const existing = scoresByGame.get(score.game_id) ?? [];
      existing.push(score as ScoreRow);
      scoresByGame.set(score.game_id, existing);
    }
  }

  // Sort games by tee-off date descending (newest first).
  const sortedGames = rows
    .map((r) => r.games)
    .sort((a, b) => {
      const aTime = a.scheduled_tee_off_at
        ? new Date(a.scheduled_tee_off_at).getTime()
        : a.ended_at
          ? new Date(a.ended_at).getTime()
          : 0;
      const bTime = b.scheduled_tee_off_at
        ? new Date(b.scheduled_tee_off_at).getTime()
        : b.ended_at
          ? new Date(b.ended_at).getTime()
          : 0;
      return bTime - aTime;
    });

  // Compute stats per game.
  const gamesWithStats: GameWithStats[] = sortedGames.map((game) => {
    const gameScores = scoresByGame.get(game.id) ?? [];
    const holeCount = gameScores.length;
    const bruttoSum =
      holeCount > 0
        ? gameScores.reduce((acc, s) => acc + (s.strokes ?? 0), 0)
        : null;
    return { ...game, bruttoSum, holeCount };
  });

  const finishedCount = gamesWithStats.length;

  return (
    <AppShell>
      <TopBar
        backHref="/profile"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
      />

      {finishedCount > 0 && (
        <p className="mb-4 text-sm text-muted">{t('roundCount', { count: finishedCount })}</p>
      )}

      {finishedCount === 0 ? (
        <Card>
          <p className="font-sans text-sm text-muted leading-relaxed">
            {t('emptyState')}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {gamesWithStats.map((game) => (
            <GameHistoryCard key={game.id} game={game} locale={locale} colBrutto={t('colBrutto')} colAvgPerHole={t('colAvgPerHole')} resultLink={t('resultLink')} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function GameHistoryCard({
  game,
  locale,
  colBrutto,
  colAvgPerHole,
  resultLink,
}: {
  game: GameWithStats;
  locale: AppLocale;
  colBrutto: string;
  colAvgPerHole: string;
  resultLink: string;
}) {
  const dateString = game.scheduled_tee_off_at
    ? formatTeeOffDateLocale(new Date(game.scheduled_tee_off_at), locale)
    : game.ended_at
      ? formatTeeOffDateLocale(new Date(game.ended_at), locale)
      : null;

  const avgPerHole =
    game.bruttoSum !== null && game.holeCount > 0
      ? (game.bruttoSum / game.holeCount).toFixed(1)
      : null;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-base font-medium text-text leading-snug truncate">
              {localizeGameName(game.name, game.courses?.name ?? null, locale)}
            </h2>
            {dateString && (
              <p className="font-sans text-sm text-muted mt-0.5 capitalize">
                {dateString}
              </p>
            )}
          </div>

          {/* Stats cluster */}
          <div className="shrink-0 flex gap-4 items-center">
            <div className="text-right">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted leading-none mb-1">
                {colBrutto}
              </p>
              <p className="font-sans tabular-nums text-base font-semibold text-text leading-none">
                {game.bruttoSum !== null ? game.bruttoSum : '—'}
              </p>
            </div>
            <div className="text-right">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-muted leading-none mb-1">
                {colAvgPerHole}
              </p>
              <p className="font-sans tabular-nums text-base font-semibold text-text leading-none">
                {avgPerHole !== null ? avgPerHole : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer link to leaderboard. The ?from=-param signals to the
          leaderboard page that "Tilbake" should land back in Min historikk
          rather than the game-home (the default backHref for /games/[id]/leaderboard).
          See issue #117 — using an explicit query-param instead of document.referrer
          because the latter is unreliable in iOS PWA standalone mode (cf. v1.8.3/v1.8.4). */}
      <div className="border-t border-border">
        <SmartLink
          href={`/games/${game.id}/leaderboard?from=/profile/historikk`}
          className="flex items-center justify-between px-5 py-3 font-sans text-[13px] font-medium text-muted hover:text-text hover:bg-bg/50 transition-colors"
        >
          <span>{resultLink}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <path
              d="M6 3l5 5-5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </SmartLink>
      </div>
    </Card>
  );
}
