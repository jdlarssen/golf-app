import { unstable_cache } from 'next/cache';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import { buildModeResultForGame } from '@/lib/scoring/buildModeResultForGame';
import {
  computeResultSummaries,
  type ResultSummary,
} from '@/lib/scoring/resultSummary';
import type { GameMode, GameModeConfig } from '@/lib/scoring/modes/types';
import {
  aggregateFinishedGame,
  isWinningSummary,
  tallyClubStats,
  type FinishedGameForTally,
} from '@/lib/stats/clubStats';
import { nameInitials } from '@/lib/names/initials';
import type { AppLocale } from '@/i18n/routing';

type GameRow = {
  id: string;
  course_id: string;
  game_mode: GameMode;
  mode_config: GameModeConfig;
};

type GamePlayerRow = {
  game_id: string;
  user_id: string;
  withdrawn_at: string | null;
  result_summary: ResultSummary | null;
  users: {
    name: string | null;
  } | null;
};

type PlayerStat = {
  userId: string;
  name: string;
  initials: string;
  count: number;
};

/**
 * Locale-agnostic aggregate the cache layer stores. Plain serializable arrays
 * (not `Map`s) because `unstable_cache` JSON-serializes its return value. The
 * locale-dependent `unknownPlayer` fallback and `nameInitials` formatting are
 * deliberately NOT baked in here — they're applied per-request at render time
 * so the same cached blob serves both `no` and `en`.
 */
type ClubStatsAggregate = {
  /** True when at least one finished game exists. Drives the empty-state
   *  branch identically to the old `games.length === 0` check — note this is
   *  about games existing, not about anyone having a stat (a finished game
   *  with only corrupt/zero-player data still leaves this `true`, so the page
   *  renders with "Ingen data ennå." sections rather than the empty state). */
  hasGames: boolean;
  /** `[userId, winCount]` for every player with ≥1 mode-correct win. */
  winnerCounts: Array<[string, number]>;
  /** `[userId, gameCount]` for every player in ≥1 finished game. */
  participationCounts: Array<[string, number]>;
  /** `[userId, name]` — first non-null name seen for each player. */
  userNames: Array<[string, string]>;
};

/**
 * Aggregate club-wide stats from every finished game.
 *
 * The winner of each game is read from the stored, mode-correct
 * `game_players.result_summary` (#572) — NOT recomputed as netto best-ball
 * (the #887 fix). Reading the stored outcome is cheap (no per-game
 * `computeLeaderboard`, no holes/scores fetch on the happy path) and correct
 * for every mode (matchplay/stableford/skins/…). Only games with NO stored
 * summary at all (finished before #572, or a failed best-effort persist) fall
 * back to `buildModeResultForGame`, which re-derives the same `ModeResult` the
 * summaries were built from. Withdrawn players (`withdrawn_at`) are excluded
 * from both the winner and the participation tally, matching every other
 * surface; the fallback engine already drops them too.
 *
 * ## Why the admin client
 *
 * `unstable_cache` callbacks cannot read request-scoped APIs (`cookies()`,
 * `headers()`), so the cookie-based `getServerClient()` can't be used inside
 * the cache. We use the service-role `getAdminClient()` (same pattern as
 * `lib/games/getGameWithPlayers.ts`). This does NOT widen exposure: the data
 * is already globally public — every finished game is world-readable via the
 * open `games.status = 'finished'` RLS policy, and this page is reachable by
 * any logged-in user. The auth gate (`getProxyVerifiedUserId`) stays at the
 * call-site, outside the cache, so the gate is unchanged.
 *
 * ## Why a time-based revalidate (and no tag invalidation)
 *
 * The natural invalidation trigger is "a game was finished", but wiring
 * `revalidateTag` into the game-finishing server-actions lives outside this
 * file's scope. Instead we self-heal with a 5-minute `revalidate`: a freshly
 * finished game shows up in these stats within ~5 minutes of a cache miss.
 * That staleness window is fine for a leaderboard of lifetime wins/activity —
 * it's not a live scoreboard. The `club-statistikk` tag is declared so a
 * future cross-file `revalidateTag('club-statistikk')` can invalidate on
 * demand if we later decide the lag matters.
 */
const getClubStatsAggregate = unstable_cache(
  async (): Promise<ClubStatsAggregate> => {
    const supabase = getAdminClient();

    // Round-trip 1: all finished games + mode + course (mode/config feed the
    // rare fallback path that re-derives the result for null-summary games).
    const { data: gamesRaw, error: gamesError } = await supabase
      .from('games')
      .select('id, course_id, game_mode, mode_config')
      .eq('status', 'finished')
      .returns<GameRow[]>();
    if (gamesError) throw gamesError;
    const games = gamesRaw ?? [];

    if (games.length === 0) {
      return {
        hasGames: false,
        winnerCounts: [],
        participationCounts: [],
        userNames: [],
      };
    }

    const gameIds = games.map((g) => g.id);

    // Round-trip 2: all players for those games, with their stored per-mode
    // outcome (`result_summary`, #572) and `withdrawn_at`. No holes/scores
    // fetch — the stored summary is the source of truth for who won.
    const { data: playersRaw, error: playersError } = await supabase
      .from('game_players')
      .select(
        'game_id, user_id, withdrawn_at, result_summary, users!game_players_user_id_fkey(name)',
      )
      .in('game_id', gameIds)
      .returns<GamePlayerRow[]>();
    if (playersError) throw playersError;
    const allPlayers = playersRaw ?? [];

    const playersByGame = groupBy(allPlayers, (p) => p.game_id);

    // Current name per user (first non-null wins; every row carries the live
    // name via the FK join).
    const userNames = new Map<string, string>();
    for (const p of allPlayers) {
      if (p.users?.name && !userNames.has(p.user_id)) {
        userNames.set(p.user_id, p.users.name);
      }
    }

    // Shape into the pure-tally input.
    const tallyGames: FinishedGameForTally[] = games.map((g) => ({
      id: g.id,
      players: (playersByGame.get(g.id) ?? []).map((p) => ({
        userId: p.user_id,
        name: p.users?.name ?? null,
        withdrawnAt: p.withdrawn_at,
        resultSummary: p.result_summary,
      })),
    }));

    // Games with NO stored summary at all (pre-#572 / failed persist) →
    // recompute the real per-mode result via the same engine that wrote the
    // summaries. The engine excludes withdrawn players, so winners are WD-clean.
    const fallbackGameIds = tallyGames
      .filter((g) => aggregateFinishedGame(g.players).needsFallback)
      .map((g) => g.id);

    const fallbackWinnersByGameId = new Map<string, string[]>();
    if (fallbackGameIds.length > 0) {
      const gamesById = new Map(games.map((g) => [g.id, g]));
      await Promise.all(
        fallbackGameIds.map(async (id) => {
          const game = gamesById.get(id);
          if (!game) return;
          const result = await buildModeResultForGame(supabase, {
            id: game.id,
            game_mode: game.game_mode,
            mode_config: game.mode_config,
            course_id: game.course_id,
          });
          if (result === null) return;
          const summaries = computeResultSummaries(result);
          const winners: string[] = [];
          for (const [uid, summary] of summaries) {
            if (isWinningSummary(summary)) winners.push(uid);
          }
          fallbackWinnersByGameId.set(id, winners);
        }),
      );
    }

    const { winnerCounts, participationCounts } = tallyClubStats(
      tallyGames,
      fallbackWinnersByGameId,
    );

    return {
      hasGames: true,
      winnerCounts: Array.from(winnerCounts.entries()),
      participationCounts: Array.from(participationCounts.entries()),
      userNames: Array.from(userNames.entries()),
    };
  },
  ['club-statistikk'],
  { tags: ['club-statistikk'], revalidate: 300 },
);

export default async function StatistikkPage() {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations('profile.statistikk');
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect({ href: '/login', locale });
  }

  const {
    hasGames,
    winnerCounts,
    participationCounts,
    userNames: userNamesRaw,
  } = await getClubStatsAggregate();

  if (!hasGames) {
    return <EmptyStateView />;
  }

  const unknownPlayer = t('unknownPlayer');
  const userNames = new Map(userNamesRaw);

  const winners = toSortedStats(
    new Map(winnerCounts),
    userNames,
    unknownPlayer,
  ).slice(0, 10);
  const mostActive = toSortedStats(
    new Map(participationCounts),
    userNames,
    unknownPlayer,
  ).slice(0, 10);

  return (
    <AppShell>
      <TopBar
        backHref="/"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
      />

      <h1 className="font-serif text-2xl font-medium text-text mb-1">
        {t('heading')}
      </h1>
      <p className="mb-6 font-sans text-sm text-muted">
        {t('subtitle')}
      </p>

      <StatSection
        sectionLabel={t('winnersLabel')}
        heading={t('winnersHeading')}
        subtitle={t('winnersSubtitle')}
        stats={winners}
        unitSingular={t('unitWinSingular')}
        unitPlural={t('unitWinPlural')}
        noDataLabel={t('noData')}
      />

      <div className="mt-8">
        <StatSection
          sectionLabel={t('mostActiveLabel')}
          heading={t('mostActiveHeading')}
          subtitle={t('mostActiveSubtitle')}
          stats={mostActive}
          unitSingular={t('unitGameSingular')}
          unitPlural={t('unitGamePlural')}
          noDataLabel={t('noData')}
        />
      </div>
    </AppShell>
  );
}

async function EmptyStateView() {
  const t = await getTranslations('profile.statistikk');
  return (
    <AppShell>
      <TopBar
        backHref="/"
        backLabel={t('backLabel')}
        kicker={t('kicker')}
      />

      <h1 className="font-serif text-2xl font-medium text-text mb-1">
        {t('heading')}
      </h1>
      <p className="mb-6 font-sans text-sm text-muted">
        {t('subtitle')}
      </p>

      <Card>
        <p className="font-sans text-sm text-muted leading-relaxed">
          {t('emptyState')}
        </p>
      </Card>
    </AppShell>
  );
}

function StatSection({
  sectionLabel,
  heading,
  subtitle,
  stats,
  unitSingular,
  unitPlural,
  noDataLabel,
}: {
  sectionLabel: string;
  heading: string;
  subtitle: string;
  stats: PlayerStat[];
  unitSingular: string;
  unitPlural: string;
  noDataLabel: string;
}) {
  return (
    <section className="space-y-3">
      <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-muted px-1">
        {sectionLabel}
      </p>
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-serif text-base font-medium text-text">
            {heading}
          </h2>
          <p className="font-sans text-sm text-muted mt-0.5">{subtitle}</p>
        </div>

        {stats.length === 0 ? (
          <div className="px-5 pb-5 pt-1">
            <p className="font-sans text-sm text-muted">{noDataLabel}</p>
          </div>
        ) : (
          <ol className="border-t border-border">
            {stats.map((stat, idx) => {
              const rank = idx + 1;
              const isLeader = rank === 1;
              const unit = stat.count === 1 ? unitSingular : unitPlural;
              return (
                <li
                  key={stat.userId}
                  className={`flex items-center gap-3 px-5 py-3 ${
                    idx < stats.length - 1 ? 'border-b border-border' : ''
                  } ${isLeader ? 'bg-accent/[0.06]' : ''}`}
                >
                  {/* Rank number: text-text on leader row for WCAG AA contrast
                      (text-accent ~2.16:1 fails); row tint keeps visual cue). */}
                  <span
                    className={`shrink-0 w-6 font-serif tabular-nums text-[13px] text-right ${
                      isLeader ? 'text-text font-semibold' : 'text-muted'
                    }`}
                  >
                    {rank}
                  </span>
                  {/* Avatar initial: decorative, keeps accent tint. */}
                  <span
                    className={`shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full border font-sans text-[12px] font-semibold ${
                      isLeader
                        ? 'border-accent/40 bg-accent/15 text-accent'
                        : 'border-border bg-bg text-text'
                    }`}
                    aria-hidden="true"
                  >
                    {stat.initials}
                  </span>
                  {/* Player name: text-text for AA contrast on leader row. */}
                  <span
                    className={`min-w-0 flex-1 truncate font-serif text-[15px] font-medium ${
                      isLeader ? 'text-text' : 'text-text'
                    }`}
                  >
                    {stat.name}
                  </span>
                  {/* Count: text-text for AA contrast on leader row. */}
                  <span
                    className={`shrink-0 font-sans tabular-nums text-sm ${
                      isLeader ? 'text-text font-semibold' : 'text-muted'
                    }`}
                  >
                    {stat.count}{' '}
                    <span className="text-xs">{unit}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </section>
  );
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const existing = out.get(key);
    if (existing) {
      existing.push(item);
    } else {
      out.set(key, [item]);
    }
  }
  return out;
}

function toSortedStats(
  counts: Map<string, number>,
  userNames: Map<string, string>,
  unknownFallback: string,
): PlayerStat[] {
  const entries: PlayerStat[] = [];
  for (const [userId, count] of counts.entries()) {
    if (count <= 0) continue;
    const name = userNames.get(userId) ?? unknownFallback;
    entries.push({
      userId,
      name,
      initials: nameInitials(name),
      count,
    });
  }
  // Sort by count desc, then name asc for stable ordering on ties.
  entries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'nb'));
  return entries;
}
