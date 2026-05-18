import { notFound, redirect } from 'next/navigation';
import { getServerClient } from '@/lib/supabase/server';
import { getProxyVerifiedUserId } from '@/lib/auth/userId';
import { strokesForHole } from '@/lib/scoring/strokeAllocation';
import { revealState, shouldHideNetto } from '@/lib/games/visibility';
import { nameInitials } from '@/lib/names/initials';
import { getGameWithPlayers } from '@/lib/games/getGameWithPlayers';
import { HoleClient, type ClientPlayer } from './HoleClient';

type Params = Promise<{ id: string; holeNumber: string }>;

type HoleRow = {
  hole_number: number;
  par: number;
  stroke_index: number;
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

  const userId = await getProxyVerifiedUserId();
  if (!userId) redirect('/login');

  // games + game_players come from the tag-cached helper (see
  // lib/games/getGameWithPlayers.ts). These rows don't change during a
  // hull-bytte, so reading them from the cache saves a Supabase round-trip
  // per hole-navigation. Authorization stays here at the call-site:
  // `me = allPlayers.find(...)` notFound() below covers the auth check that
  // RLS used to provide for the per-request server client.
  const result = await getGameWithPlayers(id);
  if (!result) notFound();
  const { game, players: allPlayers } = result;

  if (game.status === 'draft') {
    redirect('/');
  }
  if (game.status === 'scheduled') {
    // Round hasn't started; state #2 venterom lives on the game home page.
    redirect(`/games/${id}`);
  }

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

  // Round 2 — hole row, flight scores and the user's completed-hole count.
  // All three are independent and can run in parallel:
  //   hole       needs game.course_id (resolved from the cached read above)
  //   scores     needs playerIds (also resolved above)
  //   scoreCount needs only id + userId, available from the start
  const supabase = await getServerClient();
  const [holeRes, scoresRes, scoreCountRes] = await Promise.all([
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
    supabase
      .from('scores')
      .select('hole_number', { count: 'exact', head: true })
      .eq('game_id', id)
      .eq('user_id', userId)
      .not('strokes', 'is', null),
  ]);

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
      key={holeNumber}
      className="min-h-screen bg-bg flex flex-col animate-hole-enter"
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
