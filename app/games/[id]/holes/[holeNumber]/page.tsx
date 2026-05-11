import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/ui/AppShell';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { HoleScoreInput } from './HoleScoreInput';

type Params = Promise<{ id: string; holeNumber: string }>;

type GameStatus = 'draft' | 'active' | 'finished';

type GameRow = {
  id: string;
  status: GameStatus;
  course_id: string;
  tee_box_id: string;
};

type MyPlayerRow = {
  user_id: string;
  flight_number: number;
  course_handicap: number | null;
};

type HoleRow = {
  hole_number: number;
  par: number;
  stroke_index: number;
};

type FlightPlayerRow = {
  user_id: string;
  team_number: number;
  flight_number: number;
  course_handicap: number | null;
  users: { name: string; nickname: string | null } | null;
};

type ScoreRow = {
  user_id: string;
  strokes: number | null;
  client_updated_at: string | null;
  updated_at: string | null;
};

export default async function HolePage({ params }: { params: Params }) {
  const { id, holeNumber: holeStr } = await params;
  const holeNumber = Number(holeStr);
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    notFound();
  }

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, status, course_id, tee_box_id')
    .eq('id', id)
    .single<GameRow>();

  if (gameError || !game) notFound();

  if (game.status === 'draft') {
    redirect('/');
  }

  const { data: me, error: meError } = await supabase
    .from('game_players')
    .select('user_id, flight_number, course_handicap')
    .eq('game_id', id)
    .eq('user_id', user.id)
    .maybeSingle<MyPlayerRow>();
  if (meError) throw meError;
  if (!me) notFound();

  const { data: hole, error: holeError } = await supabase
    .from('course_holes')
    .select('hole_number, par, stroke_index')
    .eq('course_id', game.course_id)
    .eq('hole_number', holeNumber)
    .single<HoleRow>();
  if (holeError || !hole) notFound();

  // All players in MY flight (includes me).
  const { data: flightPlayers, error: flightError } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, flight_number, course_handicap, users!game_players_user_id_fkey(name, nickname)',
    )
    .eq('game_id', id)
    .eq('flight_number', me.flight_number)
    .returns<FlightPlayerRow[]>();
  if (flightError) throw flightError;

  const players = flightPlayers ?? [];
  const playerIds = players.map((p) => p.user_id);

  // Existing scores at this hole for the flight.
  const scoresByUser: Record<string, ScoreRow> = {};
  if (playerIds.length > 0) {
    const { data: scores, error: scoresError } = await supabase
      .from('scores')
      .select('user_id, strokes, client_updated_at, updated_at')
      .eq('game_id', id)
      .eq('hole_number', holeNumber)
      .in('user_id', playerIds)
      .returns<ScoreRow[]>();
    if (scoresError) throw scoresError;
    for (const s of scores ?? []) scoresByUser[s.user_id] = s;
  }

  function displayName(p: FlightPlayerRow): {
    name: string;
    nickname: string | null;
  } {
    if (!p.users) return { name: '(ukjent spiller)', nickname: null };
    return { name: p.users.name, nickname: p.users.nickname };
  }

  const disabled = game.status !== 'active';
  const prev = holeNumber - 1;
  const next = holeNumber + 1;

  return (
    <AppShell>
      <PageHeader
        title={`Hull ${holeNumber} av 18`}
        action={
          <Link
            href={`/games/${id}/scorecard`}
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Mitt kort
          </Link>
        }
      />

      <div className="space-y-4">
        <Card>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-medium">Par {hole.par}</span>
            <span className="text-zinc-500"> · SI {hole.stroke_index}</span>
          </p>
        </Card>

        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {players.map((p) => {
              const isMe = p.user_id === user.id;
              const ch = p.course_handicap ?? 0;
              const extra = strokesForHole(ch, hole.stroke_index);
              const scoreRow = scoresByUser[p.user_id];
              const initial = scoreRow?.strokes ?? null;
              const { name, nickname } = displayName(p);
              return (
                <li
                  key={p.user_id}
                  className={`flex items-center justify-between gap-3 px-4 py-4 ${
                    isMe ? 'bg-green-50 dark:bg-green-950/30' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {name}
                      {nickname && (
                        <span className="text-zinc-500 italic font-normal">
                          {' '}
                          «{nickname}»
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {extra > 0
                        ? `+${extra} slag`
                        : extra < 0
                          ? `${extra} slag`
                          : 'Ingen ekstra slag'}
                    </p>
                  </div>
                  <HoleScoreInput
                    gameId={id}
                    userId={p.user_id}
                    holeNumber={holeNumber}
                    initialStrokes={initial}
                    initialClientUpdatedAt={scoreRow?.client_updated_at ?? null}
                    initialServerUpdatedAt={scoreRow?.updated_at ?? null}
                    myUserId={user.id}
                    disabled={disabled}
                  />
                </li>
              );
            })}
          </ul>
        </Card>

        <nav className="flex items-center justify-between gap-3 pt-2">
          {prev >= 1 ? (
            <Link
              href={`/games/${id}/holes/${prev}`}
              className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              ← Forrige hull
            </Link>
          ) : (
            <span className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-400 dark:text-zinc-600 cursor-not-allowed">
              ← Forrige hull
            </span>
          )}
          <span className="px-2 text-xs text-zinc-500 whitespace-nowrap">
            Hull {holeNumber}/18
          </span>
          {next <= 18 ? (
            <Link
              href={`/games/${id}/holes/${next}`}
              className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Neste hull →
            </Link>
          ) : (
            <Link
              href={`/games/${id}/scorecard`}
              className="flex-1 min-h-[44px] flex items-center justify-center rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 text-sm font-medium transition-colors"
            >
              Mitt scorekort →
            </Link>
          )}
        </nav>
      </div>
    </AppShell>
  );
}
