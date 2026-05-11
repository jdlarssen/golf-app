import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { ModeToggle } from '../page';
import {
  computeLeaderboard,
  parseMode,
  playerDisplayName,
  positionBadge,
  teamMembersLabel,
  type LbHole,
  type LbPlayer,
  type LbScore,
  type LeaderboardMode,
  type TeamLine,
} from '@/lib/leaderboard';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ mode?: string | string[] }>;

type GameStatus = 'draft' | 'active' | 'finished';

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  course_id: string;
  courses: { name: string } | null;
};

type GamePlayerRow = {
  user_id: string;
  team_number: number;
  course_handicap: number | null;
  users: { name: string; nickname: string | null } | null;
};

type CourseHoleRow = {
  hole_number: number;
  par: number;
  stroke_index: number;
};

type ScoreRow = {
  user_id: string;
  hole_number: number;
  strokes: number | null;
};

export default async function LeaderboardHolesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const mode: LeaderboardMode = parseMode(sp.mode);

  const supabase = await getServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, name, status, course_id, courses(name)')
    .eq('id', id)
    .single<GameRow>();
  if (gameError || !game) notFound();

  if (game.status !== 'finished') {
    redirect(`/games/${id}`);
  }

  // Participant OR admin guard.
  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single<{ is_admin: boolean }>();
  const isAdmin = profile?.is_admin === true;
  if (!isAdmin) {
    const { data: me } = await supabase
      .from('game_players')
      .select('user_id')
      .eq('game_id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!me) notFound();
  }

  const { data: rawPlayers, error: playersError } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, course_handicap, users!game_players_user_id_fkey(name, nickname)',
    )
    .eq('game_id', id)
    .returns<GamePlayerRow[]>();
  if (playersError) throw playersError;

  const { data: rawHoles, error: holesError } = await supabase
    .from('course_holes')
    .select('hole_number, par, stroke_index')
    .eq('course_id', game.course_id)
    .order('hole_number', { ascending: true })
    .returns<CourseHoleRow[]>();
  if (holesError) throw holesError;

  const { data: rawScores, error: scoresError } = await supabase
    .from('scores')
    .select('user_id, hole_number, strokes')
    .eq('game_id', id)
    .returns<ScoreRow[]>();
  if (scoresError) throw scoresError;

  const players: LbPlayer[] = (rawPlayers ?? [])
    .filter((p) => p.users != null)
    .map((p) => ({
      userId: p.user_id,
      name: p.users!.name,
      nickname: p.users!.nickname,
      teamNumber: p.team_number,
      courseHandicap: p.course_handicap ?? 0,
    }));

  const holes: LbHole[] = (rawHoles ?? []).map((h) => ({
    holeNumber: h.hole_number,
    par: h.par,
    strokeIndex: h.stroke_index,
  }));

  const scores: LbScore[] = (rawScores ?? []).map((s) => ({
    userId: s.user_id,
    holeNumber: s.hole_number,
    strokes: s.strokes,
  }));

  const lines = computeLeaderboard({ mode, players, holes, scores });
  const orderedLines = [...lines].sort((a, b) => a.rank - b.rank);

  return (
    <AppShell>
      <PageHeader
        title="Hull for hull"
        subtitle={game.name}
        action={
          <Link
            href={`/games/${id}/leaderboard?mode=${mode}`}
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Leaderboard
          </Link>
        }
      />

      <ModeToggle gameId={id} mode={mode} basePath="/leaderboard/holes" />

      <div className="space-y-4 mt-4">
        {orderedLines.map((line) => (
          <TeamDrilldownCard key={line.teamNumber} line={line} mode={mode} />
        ))}
      </div>
    </AppShell>
  );
}

function TeamDrilldownCard({
  line,
  mode,
}: {
  line: TeamLine;
  mode: LeaderboardMode;
}) {
  const badge = positionBadge(line.rank);
  const members = teamMembersLabel(line.players);
  const nameById = new Map(
    line.players.map((p) => [p.userId, playerDisplayName(p)]),
  );

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <span className="mr-1">{badge}</span> Lag {line.teamNumber}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 truncate">
            {members || '(uten spillere)'}
          </p>
        </div>
        <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100 shrink-0">
          {line.total}
        </p>
      </div>

      <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 -mx-2">
        {line.holes.map((h) => (
          <li key={h.holeNumber} className="px-2 py-2.5">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Hull {h.holeNumber}{' '}
                <span className="text-xs text-zinc-500 font-normal">
                  (Par {h.par})
                </span>
              </p>
              <p className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                Lag: {h.teamNet ?? '⚠️'}
              </p>
            </div>
            <ul className="space-y-0.5">
              {h.players.map((pc) => {
                const name = nameById.get(pc.userId) ?? pc.userId;
                const isContrib = pc.isContributor && pc.gross !== null;
                const grossText = pc.gross == null ? '–' : String(pc.gross);
                return (
                  <li
                    key={pc.userId}
                    className={`flex items-center justify-between gap-2 text-sm ${
                      isContrib
                        ? 'font-semibold text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    <span className="truncate">{name}</span>
                    <span className="tabular-nums whitespace-nowrap">
                      {mode === 'netto' && pc.gross !== null ? (
                        <>
                          {grossText} ({signed(-pc.extraStrokes)}) →{' '}
                          {pc.net}
                        </>
                      ) : (
                        grossText
                      )}
                      {isContrib && (
                        <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">
                          vinner
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function signed(n: number): string {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}
