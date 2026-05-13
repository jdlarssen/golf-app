import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { HoleClient, type ClientPlayer } from './HoleClient';

type Params = Promise<{ id: string; holeNumber: string }>;

type GameStatus = 'draft' | 'scheduled' | 'active' | 'finished';

type GameRow = {
  id: string;
  name: string;
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
  // Hole entry only renders when status is 'active' or 'finished'; pending
  // invitees can't reach those states per Task 7's publish-gate. Typed
  // nullable to match the DB column.
  users: { name: string | null; nickname: string | null } | null;
};

type ScoreRow = {
  user_id: string;
  strokes: number | null;
  client_updated_at: string | null;
  updated_at: string | null;
};

function firstInitial(displayName: string): string {
  // Unicode-safe: handles Norwegian Å/Æ/Ø and surrogate pairs.
  const first = Array.from(displayName)[0];
  return first ? first.toUpperCase() : '?';
}

export default async function HolePage({ params }: { params: Params }) {
  const { id, holeNumber: holeStr } = await params;
  const holeNumber = Number(holeStr);
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    notFound();
  }

  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect('/login');
  const supabase = await getServerClient();

  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, name, status, course_id, tee_box_id')
    .eq('id', id)
    .single<GameRow>();

  if (gameError || !game) notFound();

  if (game.status === 'draft') {
    redirect('/');
  }
  if (game.status === 'scheduled') {
    // Round hasn't started; state #2 venterom lives on the game home page.
    redirect(`/games/${id}`);
  }

  const { data: me, error: meError } = await supabase
    .from('game_players')
    .select('user_id, flight_number, course_handicap, submitted_at')
    .eq('game_id', id)
    .eq('user_id', userId)
    .maybeSingle<MyPlayerRow>();
  if (meError) throw meError;
  if (!me) notFound();

  // Once the player has submitted their scorecard, the hole pages are
  // read-only and confusing to land on. Bounce them home.
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

  const flight = flightPlayers ?? [];
  const playerIds = flight.map((p) => p.user_id);

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

  // Count how many of MY 18 holes have a score recorded. When this hits 18
  // the bottom CTA flips to 'Lever scorekort' on every hole so the player
  // can submit from wherever they are instead of having to navigate back to
  // hole 18 first.
  const { count: myScoredCount } = await supabase
    .from('scores')
    .select('hole_number', { count: 'exact', head: true })
    .eq('game_id', id)
    .eq('user_id', userId)
    .not('strokes', 'is', null);
  const myCompletedHoles = myScoredCount ?? 0;

  const playersForClient: ClientPlayer[] = flight.map((p) => {
    const name = p.users?.name ?? '(ukjent spiller)';
    const rawNickname = p.users?.nickname ?? null;
    const nickname =
      rawNickname && rawNickname.trim().length > 0 ? rawNickname : null;
    const display = nickname ?? name;
    const ch = p.course_handicap ?? 0;
    const scoreRow = scoresByUser[p.user_id];
    return {
      userId: p.user_id,
      name,
      nickname,
      initial: firstInitial(display),
      extraStrokes: strokesForHole(ch, hole.stroke_index),
      initialStrokes: scoreRow?.strokes ?? null,
      initialClientUpdatedAt: scoreRow?.client_updated_at ?? null,
      initialServerUpdatedAt: scoreRow?.updated_at ?? null,
      submitted: p.submitted_at != null,
    };
  });

  return (
    <div
      className="min-h-screen bg-bg flex flex-col"
      style={{ paddingTop: 54, paddingBottom: 34 }}
    >
      <HoleClient
        gameId={id}
        gameName={game.name}
        gameStatus={game.status}
        currentHole={holeNumber}
        par={hole.par}
        strokeIndex={hole.stroke_index}
        myUserId={userId}
        myCompletedHoles={myCompletedHoles}
        players={playersForClient}
      />
    </div>
  );
}
