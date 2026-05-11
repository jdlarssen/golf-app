import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  computeLeaderboard,
  parseMode,
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
  tee_box_id: string;
  courses: { name: string } | null;
  tee_boxes: { name: string } | null;
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

export default async function LeaderboardPage({
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
    .select(
      'id, name, status, course_id, tee_box_id, courses(name), tee_boxes(name)',
    )
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

  // Compute both modes up front; pick which to render.
  const linesNetto = computeLeaderboard({ mode: 'netto', players, holes, scores });
  const linesBrutto = computeLeaderboard({ mode: 'brutto', players, holes, scores });
  const lines = mode === 'netto' ? linesNetto : linesBrutto;

  // Sort by rank for display.
  const orderedLines = [...lines].sort((a, b) => a.rank - b.rank);

  const subtitle =
    [game.name, game.courses?.name].filter(Boolean).join(' · ') || undefined;

  return (
    <AppShell>
      <PageHeader
        title="Leaderboard"
        subtitle={subtitle}
        action={
          <Link
            href="/"
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Hjem
          </Link>
        }
      />

      <ModeToggle gameId={id} mode={mode} basePath="/leaderboard" />

      <div className="space-y-3 mt-4">
        {orderedLines.length === 0 && (
          <Card>
            <p className="text-sm text-zinc-500">
              Ingen lag å vise.
            </p>
          </Card>
        )}
        {orderedLines.map((line) => (
          <TeamCard key={line.teamNumber} line={line} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Link
          href={`/games/${id}/leaderboard/holes?mode=${mode}`}
          className="block"
        >
          <div className="w-full min-h-[44px] border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 rounded-full font-medium transition-colors text-center text-sm">
            Hull for hull →
          </div>
        </Link>
        <Link href={`/games/${id}/scorecard`} className="block">
          <div className="w-full min-h-[44px] border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 px-4 py-2.5 rounded-full font-medium transition-colors text-center text-sm">
            Mitt scorekort →
          </div>
        </Link>
      </div>
    </AppShell>
  );
}

function TeamCard({ line }: { line: TeamLine }) {
  const badge = positionBadge(line.rank);
  const members = teamMembersLabel(line.players);
  const missing = line.missingHoles.length;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            <span className="mr-1">{badge}</span> Lag {line.teamNumber}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 truncate">
            {members || '(uten spillere)'}
          </p>
          {line.tiedWith.length > 0 && (
            <p className="text-xs text-zinc-500 mt-1">
              Delt {line.rank}. plass med{' '}
              {line.tiedWith.map((id) => `Lag ${id}`).join(', ')}
            </p>
          )}
          {missing > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              ⚠️ {missing} hull mangler
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {line.total}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function ModeToggle({
  gameId,
  mode,
  basePath,
}: {
  gameId: string;
  mode: LeaderboardMode;
  // e.g. "/leaderboard" or "/leaderboard/holes"
  basePath: string;
}) {
  const base = `/games/${gameId}${basePath}`;
  return (
    <div
      role="tablist"
      aria-label="Modus"
      className="inline-flex rounded-full bg-zinc-100 dark:bg-zinc-800 p-1"
    >
      <Link
        role="tab"
        aria-selected={mode === 'netto'}
        href={`${base}?mode=netto`}
        className={`min-h-[36px] px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
          mode === 'netto'
            ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
        }`}
      >
        Netto
      </Link>
      <Link
        role="tab"
        aria-selected={mode === 'brutto'}
        href={`${base}?mode=brutto`}
        className={`min-h-[36px] px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
          mode === 'brutto'
            ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
        }`}
      >
        Brutto
      </Link>
    </div>
  );
}
