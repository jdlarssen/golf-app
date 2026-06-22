import { unstable_cache } from 'next/cache';
import { redirect } from '@/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { COURSE_HOLES_SELECT, SCORES_SELECT } from '@/lib/supabase/queryFragments';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { AppShell } from '@/components/ui/AppShell';
import { TopBar } from '@/components/ui/TopBar';
import { Card } from '@/components/ui/Card';
import {
  computeLeaderboard,
  type LbHole,
  type LbPlayer,
  type LbScore,
} from '@/lib/leaderboard';
import { nameInitials } from '@/lib/names/initials';
import type { AppLocale } from '@/i18n/routing';

type GameRow = {
  id: string;
  course_id: string;
};

type GamePlayerRow = {
  game_id: string;
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  tee_gender: 'mens' | 'ladies' | 'juniors';
  users: {
    name: string | null;
    nickname: string | null;
  } | null;
};

type CourseHoleRow = {
  course_id: string;
  hole_number: number;
  par_mens: number;
  par_ladies: number;
  par_juniors: number;
  stroke_index: number;
};

type ScoreRow = {
  game_id: string;
  user_id: string;
  hole_number: number;
  strokes: number | null;
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
  /** `[userId, winCount]` for every player that has ≥1 best-ball-netto win. */
  winnerCounts: Array<[string, number]>;
  /** `[userId, gameCount]` for every player in ≥1 finished game. */
  participationCounts: Array<[string, number]>;
  /** `[userId, name]` — first non-null name seen for each player. */
  userNames: Array<[string, string]>;
};

/**
 * Aggregate club-wide stats from every finished game. This is the expensive
 * part of the page: it reads ALL finished games + their players + holes +
 * scores and runs `computeLeaderboard` once per game. The work grows with
 * (games × players × holes), so against club scale (~150 players, many games)
 * it's a real scaling cliff.
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

    // Round-trip 1: all finished games + their course_id.
    const { data: gamesRaw, error: gamesError } = await supabase
      .from('games')
      .select('id, course_id')
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
    const courseIds = Array.from(new Set(games.map((g) => g.course_id)));

    // Round-trips 2, 3, 4: bulk-fetch players, holes, scores in parallel.
    const [playersRes, holesRes, scoresRes] = await Promise.all([
      supabase
        .from('game_players')
        .select(
          'game_id, user_id, team_number, course_handicap, tee_gender, users!game_players_user_id_fkey(name, nickname)',
        )
        .in('game_id', gameIds)
        .returns<GamePlayerRow[]>(),
      supabase
        .from('course_holes')
        .select(`course_id, ${COURSE_HOLES_SELECT}`)
        .in('course_id', courseIds)
        .returns<CourseHoleRow[]>(),
      supabase
        .from('scores')
        .select(`game_id, ${SCORES_SELECT}`)
        .in('game_id', gameIds)
        .returns<ScoreRow[]>(),
    ]);

    if (playersRes.error) throw playersRes.error;
    if (holesRes.error) throw holesRes.error;
    if (scoresRes.error) throw scoresRes.error;

    const allPlayers = playersRes.data ?? [];
    const allHoles = holesRes.data ?? [];
    const allScores = scoresRes.data ?? [];

    // Index for fast lookup per game / course.
    const playersByGame = groupBy(allPlayers, (p) => p.game_id);
    const holesByCourse = groupBy(allHoles, (h) => h.course_id);
    const scoresByGame = groupBy(allScores, (s) => s.game_id);

    // Aggregators.
    const winnerCount = new Map<string, number>();
    const participationCount = new Map<string, number>();
    const userNames = new Map<string, string>();

    // The aggregate is locale-agnostic, so the unknown-player fallback name is
    // resolved at render time, not here. Best-ball lines need a placeholder
    // name to compute (it's never read back out of the result), so use an
    // empty string — it has no effect on win attribution (we key on userId).
    const NAME_PLACEHOLDER = '';

    for (const game of games) {
      const gamePlayers = playersByGame.get(game.id) ?? [];
      if (gamePlayers.length === 0) {
        // Corrupt data — finished game with no players. Skip silently.
        continue;
      }

      // Track participation (any player in the finished game counts).
      for (const gp of gamePlayers) {
        participationCount.set(
          gp.user_id,
          (participationCount.get(gp.user_id) ?? 0) + 1,
        );
        if (gp.users?.name && !userNames.has(gp.user_id)) {
          userNames.set(gp.user_id, gp.users.name);
        }
      }

      // Compute winner team(s) via the same logic used on the live leaderboard.
      // Tied #1 teams all share the win (rank === 1 covers ties via rankTeams).
      const lbPlayers: LbPlayer[] = gamePlayers.map((p) => ({
        userId: p.user_id,
        name: p.users?.name ?? NAME_PLACEHOLDER,
        nickname: p.users?.nickname ?? null,
        teamNumber: p.team_number,
        courseHandicap: p.course_handicap ?? 0,
        teeGender: p.tee_gender,
      }));

      const lbHoles: LbHole[] = (holesByCourse.get(game.course_id) ?? []).map(
        (h) => ({
          holeNumber: h.hole_number,
          par: h.par_mens,
          parByGender: {
            mens: h.par_mens,
            ladies: h.par_ladies,
            juniors: h.par_juniors,
          },
          strokeIndex: h.stroke_index,
        }),
      );

      const lbScores: LbScore[] = (scoresByGame.get(game.id) ?? []).map((s) => ({
        userId: s.user_id,
        holeNumber: s.hole_number,
        strokes: s.strokes,
      }));

      // Best-ball requires at least one hole — guard against corrupt data.
      if (lbHoles.length === 0) continue;

      const lines = computeLeaderboard({
        mode: 'netto',
        players: lbPlayers,
        holes: lbHoles,
        scores: lbScores,
      });

      const winningTeams = lines.filter((l) => l.rank === 1);
      for (const team of winningTeams) {
        for (const p of team.players) {
          winnerCount.set(p.userId, (winnerCount.get(p.userId) ?? 0) + 1);
        }
      }
    }

    return {
      hasGames: true,
      winnerCounts: Array.from(winnerCount.entries()),
      participationCounts: Array.from(participationCount.entries()),
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
        backHref="/profile"
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
        backHref="/profile"
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
                  <span
                    className={`shrink-0 w-6 font-serif tabular-nums text-[13px] text-right ${
                      isLeader ? 'text-accent font-semibold' : 'text-muted'
                    }`}
                  >
                    {rank}
                  </span>
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
                  <span
                    className={`min-w-0 flex-1 truncate font-serif text-[15px] font-medium ${
                      isLeader ? 'text-accent' : 'text-text'
                    }`}
                  >
                    {stat.name}
                  </span>
                  <span
                    className={`shrink-0 font-sans tabular-nums text-sm ${
                      isLeader ? 'text-accent font-semibold' : 'text-muted'
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
