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
import { formatDisplayLabelKey } from '@/lib/games/formatLabel';
import { finishedResultBadge } from '@/lib/games/finishedResultBadge';
import type { ResultSummary } from '@/lib/scoring/resultSummary';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import type { AppLocale } from '@/i18n/routing';

type GameRow = {
  id: string;
  name: string;
  scheduled_tee_off_at: string | null;
  ended_at: string | null;
  game_mode: GameMode;
  mode_config: GameModeConfig;
  // #624 — banenavn for re-lokalisering av auto-genererte spillnavn.
  courses: { name: string } | null;
};

type ScoreRow = {
  game_id: string;
  strokes: number | null;
};

/** Et avsluttet spill beriket med spillerens egne tall (#866). */
type GameWithMeta = GameRow & {
  /** Strokes received — netto = brutto − dette (#866). */
  course_handicap: number | null;
  /** Format-riktig utfall (#572) → resultat-badge. */
  result_summary: ResultSummary | null;
};

type GameWithStats = GameWithMeta & {
  bruttoSum: number | null;
  nettoSum: number | null;
  holeCount: number;
};

export default async function HistorikkPage() {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('profile.historikk');
  const tModes = await getTranslations('modes');
  const tFinished = await getTranslations('finishedCard');
  const userIdRaw = await getProxyVerifiedUserId();
  if (!userIdRaw) redirect({ href: '/login', locale });
  const userId = userIdRaw as string; // guarded non-null above (redirect isn't typed `never`)

  const supabase = await getServerClient();

  // Round-trip 1: all finished games the user participated in, with the
  // player's own strokes-received (`course_handicap`) and stored per-mode
  // outcome (`result_summary`, #572) for netto + result badge.
  // No SQL `.order()` here: supabase-js foreignTable-order is a no-op on a
  // to-one `games!inner` embed (#569) — the JS sort below is authoritative.
  const { data: gamePlayers, error: gpError } = await supabase
    .from('game_players')
    .select(
      'game_id, course_handicap, result_summary, games!inner(id, name, scheduled_tee_off_at, ended_at, game_mode, mode_config, courses(name))',
    )
    .eq('user_id', userId)
    .eq('games.status', 'finished');

  if (gpError) throw gpError;

  const rows = (gamePlayers ?? []) as unknown as Array<{
    game_id: string;
    course_handicap: number | null;
    result_summary: ResultSummary | null;
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

  // Carry course_handicap + result_summary onto the game, then sort by tee-off
  // date descending (newest first).
  const sortedGames: GameWithMeta[] = rows
    .map((r) => ({
      ...r.games,
      course_handicap: r.course_handicap,
      result_summary: r.result_summary,
    }))
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

  // Compute brutto + netto per game.
  const gamesWithStats: GameWithStats[] = sortedGames.map((game) => {
    const gameScores = scoresByGame.get(game.id) ?? [];
    const holeCount = gameScores.length;
    const bruttoSum =
      holeCount > 0
        ? gameScores.reduce((acc, s) => acc + (s.strokes ?? 0), 0)
        : null;
    const nettoSum =
      bruttoSum != null && game.course_handicap != null
        ? bruttoSum - game.course_handicap
        : null;
    return { ...game, bruttoSum, nettoSum, holeCount };
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
          {gamesWithStats.map((game) => {
            const formatLabel = tModes(
              formatDisplayLabelKey(
                game.game_mode,
                game.mode_config,
              ) as Parameters<typeof tModes>[0],
            );
            const badge = game.result_summary
              ? finishedResultBadge(game.result_summary)
              : null;
            const resultText = badge
              ? tFinished(
                  badge.key as Parameters<typeof tFinished>[0],
                  badge.values as Parameters<typeof tFinished>[1],
                )
              : null;
            return (
              <GameHistoryCard
                key={game.id}
                game={game}
                locale={locale}
                colBrutto={t('colBrutto')}
                colNetto={t('colNetto')}
                resultLink={t('resultLink')}
                formatLabel={formatLabel}
                resultText={resultText}
                resultIsWin={badge?.isWin ?? false}
              />
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function GameHistoryCard({
  game,
  locale,
  colBrutto,
  colNetto,
  resultLink,
  formatLabel,
  resultText,
  resultIsWin,
}: {
  game: GameWithStats;
  locale: AppLocale;
  colBrutto: string;
  colNetto: string;
  resultLink: string;
  formatLabel: string;
  resultText: string | null;
  resultIsWin: boolean;
}) {
  const dateString = game.scheduled_tee_off_at
    ? formatTeeOffDateLocale(new Date(game.scheduled_tee_off_at), locale)
    : game.ended_at
      ? formatTeeOffDateLocale(new Date(game.ended_at), locale)
      : null;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4">
        {/* flex-wrap lets the stats cluster drop below the name on narrow
            screens (~360px) instead of squeezing the game name to one word. */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h2 className="font-serif text-base font-medium text-text leading-snug">
              {localizeGameName(game.name, game.courses?.name ?? null, locale)}
            </h2>
            {dateString && (
              <p className="font-sans text-sm text-muted mt-0.5 capitalize">
                {dateString}
              </p>
            )}
            {/* #866: spillform-merke + ditt resultat — så «96» får kontekst. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-border bg-bg px-2 py-0.5 font-sans text-[11px] text-muted">
                {formatLabel}
              </span>
              {resultText && (
                <span
                  className={`font-sans text-[13px] font-medium ${
                    resultIsWin ? 'text-accent' : 'text-muted'
                  }`}
                >
                  {resultText}
                </span>
              )}
            </div>
          </div>

          {/* Stats cluster: brutto + netto (#866 — netto erstatter snitt/hull,
              det mest meningsfulle tallet for en spiller med handicap). */}
          <div className="flex shrink-0 gap-4 items-center">
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
                {colNetto}
              </p>
              <p className="font-sans tabular-nums text-base font-semibold text-text leading-none">
                {game.nettoSum !== null ? game.nettoSum : '—'}
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
