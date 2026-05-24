import { redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
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

type GameRow = {
  id: string;
  course_id: string;
};

type GamePlayerRow = {
  game_id: string;
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  users: {
    name: string | null;
    nickname: string | null;
  } | null;
};

type CourseHoleRow = {
  course_id: string;
  hole_number: number;
  par: number;
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

export default async function StatistikkPage() {
  const userId = await getProxyVerifiedUserId();
  if (!userId) {
    redirect('/login');
  }

  const supabase = await getServerClient();

  // Round-trip 1: all finished games + their course_id. RLS allows reading
  // every finished game (`games.status = 'finished'` policy is open).
  const { data: gamesRaw, error: gamesError } = await supabase
    .from('games')
    .select('id, course_id')
    .eq('status', 'finished')
    .returns<GameRow[]>();
  if (gamesError) throw gamesError;
  const games = gamesRaw ?? [];

  if (games.length === 0) {
    return <EmptyStateView userId={userId} />;
  }

  const gameIds = games.map((g) => g.id);
  const courseIds = Array.from(new Set(games.map((g) => g.course_id)));

  // Round-trips 2, 3, 4: bulk-fetch players, holes, scores in parallel.
  const [playersRes, holesRes, scoresRes] = await Promise.all([
    supabase
      .from('game_players')
      .select(
        'game_id, user_id, team_number, course_handicap, users!game_players_user_id_fkey(name, nickname)',
      )
      .in('game_id', gameIds)
      .returns<GamePlayerRow[]>(),
    supabase
      .from('course_holes')
      .select('course_id, hole_number, par, stroke_index')
      .in('course_id', courseIds)
      .returns<CourseHoleRow[]>(),
    supabase
      .from('scores')
      .select('game_id, user_id, hole_number, strokes')
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
      name: p.users?.name ?? '(ukjent)',
      nickname: p.users?.nickname ?? null,
      teamNumber: p.team_number,
      courseHandicap: p.course_handicap ?? 0,
    }));

    const lbHoles: LbHole[] = (holesByCourse.get(game.course_id) ?? []).map(
      (h) => ({
        holeNumber: h.hole_number,
        par: h.par,
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

  const winners = toSortedStats(winnerCount, userNames).slice(0, 10);
  const mostActive = toSortedStats(participationCount, userNames).slice(0, 10);

  return (
    <AppShell>
      <TopBar
        backHref="/profile"
        backLabel="Tilbake til profil"
        kicker="Statistikk"
        userId={userId}
      />

      <h1 className="font-serif text-2xl font-medium text-text mb-1">
        Klubbstatistikker
      </h1>
      <p className="mb-6 font-sans text-sm text-muted">
        Fra alle ferdigspilte spill i Tørny.
      </p>

      <StatSection
        sectionLabel="Vinnerliste"
        heading="Flest spill vunnet"
        subtitle="Antall ganger laget ditt har endt på #1 i best-ball-netto."
        stats={winners}
        unitSingular="seier"
        unitPlural="seire"
      />

      <div className="mt-8">
        <StatSection
          sectionLabel="Mest aktive"
          heading="Flest spill spilt"
          subtitle="Antall ferdigspilte spill du har deltatt i."
          stats={mostActive}
          unitSingular="spill"
          unitPlural="spill"
        />
      </div>
    </AppShell>
  );
}

function EmptyStateView({ userId }: { userId: string }) {
  return (
    <AppShell>
      <TopBar
        backHref="/profile"
        backLabel="Tilbake til profil"
        kicker="Statistikk"
        userId={userId}
      />

      <h1 className="font-serif text-2xl font-medium text-text mb-1">
        Klubbstatistikker
      </h1>
      <p className="mb-6 font-sans text-sm text-muted">
        Fra alle ferdigspilte spill i Tørny.
      </p>

      <Card>
        <p className="font-sans text-sm text-muted leading-relaxed">
          Ingen ferdige spill ennå. Statistikken fylles inn så snart admin
          avslutter det første spillet — da ser du hvem som har vunnet flest og
          hvem som har vært med på flest.
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
}: {
  sectionLabel: string;
  heading: string;
  subtitle: string;
  stats: PlayerStat[];
  unitSingular: string;
  unitPlural: string;
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
            <p className="font-sans text-sm text-muted">Ingen data ennå.</p>
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
): PlayerStat[] {
  const entries: PlayerStat[] = [];
  for (const [userId, count] of counts.entries()) {
    if (count <= 0) continue;
    const name = userNames.get(userId) ?? '(ukjent)';
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
