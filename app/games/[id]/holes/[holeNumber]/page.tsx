import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import { nameInitials } from '@/lib/names/initials';
import { HoleClient, type ClientPlayer } from './HoleClient';
import type { GameStatus } from '@/lib/games/status';

type Params = Promise<{ id: string; holeNumber: string }>;

type GameRow = {
  id: string;
  name: string;
  status: GameStatus;
  course_id: string;
  tee_box_id: string;
  score_visibility: 'live' | 'reveal';
};

type HoleRow = {
  hole_number: number;
  par: number;
  stroke_index: number;
};

type GamePlayerRow = {
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

export default async function HolePage({ params }: { params: Params }) {
  const { id, holeNumber: holeStr } = await params;

  // Pilot perf instrumentation — surfaces server-side fetch latency in Vercel
  // logs so we can see which round-trip dominates hole-page time (auth check,
  // any of 6 Supabase fetches, or RSC serialisation). Remove or gate behind a
  // dev flag once the data informs the architecture choice in #18.
  const tLabel = `hole.page game=${id} hole=${holeStr}`;
  console.time(tLabel);
  const t = (step: string) => `${tLabel} · ${step}`;

  const holeNumber = Number(holeStr);
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) {
    notFound();
  }

  console.time(t('auth'));
  const userId = await getProxyVerifiedUserId();
  console.timeEnd(t('auth'));
  if (!userId) redirect('/login');
  const supabase = await getServerClient();

  // Round 1 — three independent fetches in parallel.
  //
  // game: needs only the route id; checks status + reveals course_id.
  // allPlayers: fetch ALL game_players for this game (typically 8 rows) in
  //   one round-trip so we can find `me` in memory and also derive my flight
  //   without a second query. Collapses the prior `me` + `flight` chain into
  //   a single call.
  // scoreCount: needs only id + userId; independent of every other fetch.
  console.time(t('round1'));
  const [gameRes, allPlayersRes, scoreCountRes] = await Promise.all([
    supabase
      .from('games')
      .select('id, name, status, course_id, tee_box_id, score_visibility')
      .eq('id', id)
      .single<GameRow>(),
    supabase
      .from('game_players')
      .select(
        'user_id, team_number, flight_number, course_handicap, submitted_at, users!game_players_user_id_fkey(name, nickname)',
      )
      .eq('game_id', id)
      .returns<GamePlayerRow[]>(),
    supabase
      .from('scores')
      .select('hole_number', { count: 'exact', head: true })
      .eq('game_id', id)
      .eq('user_id', userId)
      .not('strokes', 'is', null),
  ]);
  console.timeEnd(t('round1'));

  const { data: game, error: gameError } = gameRes;
  if (gameError || !game) notFound();

  if (game.status === 'draft') {
    redirect('/');
  }
  if (game.status === 'scheduled') {
    // Round hasn't started; state #2 venterom lives on the game home page.
    redirect(`/games/${id}`);
  }

  if (allPlayersRes.error) throw allPlayersRes.error;
  const allPlayers = allPlayersRes.data ?? [];
  const me = allPlayers.find((p) => p.user_id === userId);
  if (!me) notFound();

  // Once the player has submitted their scorecard, the hole pages are
  // read-only and confusing to land on. Bounce them home.
  if (me.submitted_at) {
    redirect(`/games/${id}`);
  }

  const flight = allPlayers.filter(
    (p) => p.flight_number === me.flight_number,
  );
  const playerIds = flight.map((p) => p.user_id);

  // Round 2 — hole row + flight scores, both independent of each other.
  // hole needs game.course_id (resolved post-round-1). scores needs
  // playerIds (also post-round-1). They can run in parallel.
  console.time(t('round2'));
  const [holeRes, scoresRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select('hole_number, par, stroke_index')
      .eq('course_id', game.course_id)
      .eq('hole_number', holeNumber)
      .single<HoleRow>(),
    supabase
      .from('scores')
      .select('user_id, strokes, client_updated_at, updated_at')
      .eq('game_id', id)
      .eq('hole_number', holeNumber)
      .in('user_id', playerIds)
      .returns<ScoreRow[]>(),
  ]);
  console.timeEnd(t('round2'));

  const { data: hole, error: holeError } = holeRes;
  if (holeError || !hole) notFound();
  if (scoresRes.error) throw scoresRes.error;

  const scoresByUser: Record<string, ScoreRow> = {};
  for (const s of scoresRes.data ?? []) scoresByUser[s.user_id] = s;

  const myCompletedHoles = scoreCountRes.count ?? 0;

  // Reveal-modus: under an active reveal-game, hide the per-card +N SLAG
  // badge so handicap-slag count stays secret. shouldHideNetto returns true
  // only for the 'reveal-active' state — live games and finished reveal games
  // render the badge normally.
  const hideNetto = shouldHideNetto(
    revealState(game.score_visibility, game.status),
  );

  console.timeEnd(tLabel);

  const playersForClient: ClientPlayer[] = flight.map((p) => {
    const name = p.users?.name ?? '(ukjent spiller)';
    const rawNickname = p.users?.nickname ?? null;
    const nickname =
      rawNickname && rawNickname.trim().length > 0 ? rawNickname : null;
    const ch = p.course_handicap ?? 0;
    const scoreRow = scoresByUser[p.user_id];
    return {
      userId: p.user_id,
      name,
      nickname,
      initial: nameInitials(name),
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
        hideNetto={hideNetto}
        players={playersForClient}
      />
    </div>
  );
}
