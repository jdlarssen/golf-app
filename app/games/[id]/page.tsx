import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

type Params = Promise<{ id: string }>;

type GameStatus = 'draft' | 'active' | 'finished';

const STATUS_LABELS: Record<GameStatus, string> = {
  draft: 'Utkast',
  active: 'Pågående',
  finished: 'Avsluttet',
};

const STATUS_BADGE_CLASSES: Record<GameStatus, string> = {
  draft:
    'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700',
  active:
    'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300 border border-green-200 dark:border-green-900',
  finished:
    'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900',
};

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  course_id: string;
  tee_box_id: string;
  courses: { name: string } | null;
  tee_boxes: { name: string; slope: number; course_rating: number; par_total: number } | null;
};

type MyPlayerRow = {
  user_id: string;
  team_number: number;
  flight_number: number;
  course_handicap: number | null;
};

export default async function GameHomePage({ params }: { params: Params }) {
  const { id } = await params;
  const supabase = await getServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Proxy redirects unauthenticated users, but be defensive.
  if (!user) redirect('/login');

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select(
      'id, name, status, course_id, tee_box_id, courses(name), tee_boxes(name, slope, course_rating, par_total)',
    )
    .eq('id', id)
    .single<GameRow>();

  if (gameError || !game) notFound();

  // Find the current user's game_players row. If they aren't a participant,
  // 404 — RLS would block this query anyway, but treat both cases the same.
  const { data: me, error: meError } = await supabase
    .from('game_players')
    .select('user_id, team_number, flight_number, course_handicap')
    .eq('game_id', id)
    .eq('user_id', user.id)
    .maybeSingle<MyPlayerRow>();

  if (meError) throw meError;
  if (!me) notFound();

  // Draft games are not for players to enter.
  if (game.status === 'draft') {
    redirect('/');
  }

  const isActive = game.status === 'active';

  return (
    <AppShell>
      <PageHeader
        title={game.name}
        action={
          <Link
            href="/"
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Hjem
          </Link>
        }
      />

      <div className="mb-4">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASSES[game.status]}`}
        >
          {STATUS_LABELS[game.status]}
        </span>
      </div>

      <div className="space-y-4">
        <Card>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Bane
          </h2>
          <p className="text-base text-zinc-900 dark:text-zinc-100">
            {game.courses?.name ?? '(ukjent bane)'}
          </p>
          {game.tee_boxes && (
            <p className="text-xs text-zinc-500 mt-1">
              Tee: {game.tee_boxes.name} · Slope {game.tee_boxes.slope} · CR{' '}
              {Number(game.tee_boxes.course_rating).toFixed(1)} · Par{' '}
              {game.tee_boxes.par_total}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Din info
          </h2>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
            <dt className="text-zinc-500">Lag</dt>
            <dd className="text-zinc-900 dark:text-zinc-100 text-right">
              Lag {me.team_number}
            </dd>
            <dt className="text-zinc-500">Flight</dt>
            <dd className="text-zinc-900 dark:text-zinc-100 text-right">
              Flight {me.flight_number}
            </dd>
            <dt className="text-zinc-500">Course handicap</dt>
            <dd className="text-zinc-900 dark:text-zinc-100 text-right">
              {me.course_handicap ?? '—'}
            </dd>
          </dl>
        </Card>

        {isActive ? (
          <Link href={`/games/${id}/holes/1`} className="block">
            <div className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors text-center text-base">
              Start runden →
            </div>
          </Link>
        ) : game.status === 'finished' ? (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-500 text-center">
            Runden er avsluttet.
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-500 text-center">
            Spillet er ikke startet ennå.
          </div>
        )}

        <Link href={`/games/${id}/scorecard`} className="block">
          <Card className="min-h-[44px] flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
            <span className="text-base font-medium text-zinc-900 dark:text-zinc-100">
              Mitt scorekort
            </span>
            <span aria-hidden className="text-zinc-400">
              →
            </span>
          </Card>
        </Link>

        <div className="pt-2">
          <Link
            href="/"
            className="block text-center text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Tilbake til hjem
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
