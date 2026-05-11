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
  submitted_at: string | null;
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
  submitted_at: string | null;
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
    .select('user_id, flight_number, course_handicap, submitted_at')
    .eq('game_id', id)
    .eq('user_id', user.id)
    .maybeSingle<MyPlayerRow>();
  if (meError) throw meError;
  if (!me) notFound();

  // Once the player has submitted their scorecard, the hole pages are
  // read-only and confusing to land on (their own row would be disabled
  // and they can't change anything). Bounce them home where the right
  // state-based info is shown.
  if (me.submitted_at) {
    redirect(`/games/${id}`);
  }

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
      'user_id, team_number, flight_number, course_handicap, submitted_at, users!game_players_user_id_fkey(name, nickname)',
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

  const gameInactive = game.status !== 'active';
  const prev = holeNumber - 1;
  const next = holeNumber + 1;

  return (
    <AppShell>
      <PageHeader
        title={`Hull ${holeNumber}`}
        subtitle={`av 18`}
        action={
          <Link
            href={`/games/${id}/scorecard`}
            className="text-sm text-muted hover:text-text transition-colors"
          >
            Mitt kort
          </Link>
        }
      />

      <div className="space-y-4">
        {/* Hole metadata: hole number BIG, par + SI as serif support. */}
        <Card>
          <div className="flex items-center justify-between gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Hull
              </p>
              <p className="font-serif text-5xl font-medium tabular-nums leading-none mt-1 text-text">
                {holeNumber}
              </p>
            </div>
            <div className="flex items-end gap-6 text-right">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Par
                </p>
                <p className="font-serif text-3xl font-medium tabular-nums leading-none mt-1 text-text">
                  {hole.par}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                  SI
                </p>
                <p className="font-serif text-3xl font-medium tabular-nums leading-none mt-1 text-text">
                  {hole.stroke_index}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border">
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
                  className={`flex items-center justify-between gap-3 px-5 py-4 ${
                    isMe ? 'bg-primary-soft' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium tracking-tight text-text truncate">
                      {name}
                      {nickname && (
                        <span className="text-muted italic font-normal">
                          {' '}
                          «{nickname}»
                        </span>
                      )}
                    </p>
                    {extra !== 0 && (
                      <p className="mt-1">
                        <span
                          className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            extra > 0
                              ? 'bg-accent/[0.12] text-accent border border-accent/30'
                              : 'bg-border/40 text-muted border border-border'
                          }`}
                        >
                          {extra > 0 ? `+${extra} slag` : `${extra} slag`}
                        </span>
                      </p>
                    )}
                  </div>
                  <HoleScoreInput
                    gameId={id}
                    userId={p.user_id}
                    holeNumber={holeNumber}
                    par={hole.par}
                    initialStrokes={initial}
                    initialClientUpdatedAt={scoreRow?.client_updated_at ?? null}
                    initialServerUpdatedAt={scoreRow?.updated_at ?? null}
                    myUserId={user.id}
                    disabled={gameInactive || p.submitted_at != null}
                  />
                </li>
              );
            })}
          </ul>
        </Card>

        <nav className="flex items-center justify-between gap-3 pt-2 text-sm">
          {prev >= 1 ? (
            <Link
              href={`/games/${id}/holes/${prev}`}
              className="flex-1 min-h-[44px] flex items-center justify-center rounded-full border border-border px-4 py-2.5 font-medium tracking-tight text-text hover:bg-primary-soft transition-colors"
            >
              ← Forrige
            </Link>
          ) : (
            <span className="flex-1 min-h-[44px] flex items-center justify-center rounded-full border border-border px-4 py-2.5 font-medium tracking-tight text-muted/60 cursor-not-allowed">
              ← Forrige
            </span>
          )}
          <span className="px-2 text-xs text-muted whitespace-nowrap tabular-nums">
            {holeNumber} / 18
          </span>
          {next <= 18 ? (
            <Link
              href={`/games/${id}/holes/${next}`}
              className="flex-1 min-h-[44px] flex items-center justify-center rounded-full border border-border px-4 py-2.5 font-medium tracking-tight text-text hover:bg-primary-soft transition-colors"
            >
              Neste →
            </Link>
          ) : (
            <Link
              href={`/games/${id}/scorecard`}
              className="flex-1 min-h-[44px] flex items-center justify-center rounded-full bg-primary hover:bg-primary-hover hover:-translate-y-px text-white px-4 py-2.5 font-medium tracking-tight transition-[background-color,transform,opacity] duration-100"
            >
              Mitt scorekort →
            </Link>
          )}
        </nav>
      </div>
    </AppShell>
  );
}
