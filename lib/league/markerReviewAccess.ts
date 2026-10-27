import 'server-only';
import { getAdminClient } from '@/lib/supabase/admin';
import { COURSE_HOLES_SELECT } from '@/lib/supabase/queryFragments';
import { parForPlayer } from '@/lib/games/parDisplay';
import type { GameMode, ScoringGender } from '@/lib/scoring/modes/types';
import { readSimulatorLeagueFlight, type LeagueFlight } from './leagueFlight';
import { mayApproveAsMarker } from './leagueMarker';

// The marker's door to a card in a simulator-league flight (#2661).
//
// The marker is usually not in the flight, and RLS on games, game_players and
// scores shows a game only to its players. So the card is read here with the
// service role, behind this gate, the way `scorecardReviewAccess` and
// `getLigaSnapshot` already read past RLS. No select policy is widened.
//
// The gate lets through the named marker, the league's organiser and a global
// admin in the marker's stead (`mayApproveAsMarker`). The owner, the one who
// delivered the card, a flightmate and any other member get `forbidden`.
// Every caller — the web page and its actions, the app's GET route, and the
// app's approve/reject route through `scorecardReviewAccess` — reads this one
// answer.
//
// A failed read throws (the page's error boundary, the route's 500), never
// «not found» or «no access»: a database that does not answer is not a no.

export type MarkerCardState = 'pending' | 'approved' | 'not_delivered' | 'withdrawn' | 'closed';

export type MarkerReview =
  | {
      ok: true;
      /** `marker`: the named marker. `organizer`: the league's organiser or a global admin. */
      role: 'marker' | 'organizer';
      flight: LeagueFlight;
      game: { name: string; status: string; gameMode: GameMode; courseId: string };
      card: {
        userId: string;
        name: string | null;
        markerUserId: string | null;
        markerName: string | null;
        submittedAt: string | null;
        approvedAt: string | null;
        teeGender: ScoringGender;
        courseHandicap: number | null;
      };
      /** Whether the card waits for an answer now (`pending`), or why not. */
      state: MarkerCardState;
    }
  | { ok: false; reason: 'not_found' | 'forbidden' };

type CardRow = {
  user_id: string;
  submitted_at: string | null;
  approved_at: string | null;
  submitted_by_user_id: string | null;
  marker_user_id: string | null;
  withdrawn_at: string | null;
  tee_gender: ScoringGender;
  course_handicap: number | null;
  users: { name: string | null; nickname: string | null } | null;
};

const displayName = (u: { name: string | null; nickname: string | null } | null | undefined) =>
  u?.name?.trim() || u?.nickname?.trim() || null;

/** Who may answer `playerUserId`'s card in `gameId`, and what the card looks like. */
export async function markerReviewAccess(
  userId: string,
  gameId: string,
  playerUserId: string,
): Promise<MarkerReview> {
  const flight = await readSimulatorLeagueFlight(gameId);
  if (!flight) return { ok: false, reason: 'not_found' };

  const admin = getAdminClient();
  const [gameRes, cardRes, profileRes] = await Promise.all([
    admin
      .from('games')
      .select('name, status, game_mode, course_id')
      .eq('id', gameId)
      .maybeSingle<{ name: string; status: string; game_mode: GameMode; course_id: string }>(),
    admin
      .from('game_players')
      .select(
        'user_id, submitted_at, approved_at, submitted_by_user_id, marker_user_id, withdrawn_at, tee_gender, course_handicap, users!game_players_user_id_fkey(name, nickname)',
      )
      .eq('game_id', gameId)
      .eq('user_id', playerUserId)
      .maybeSingle<CardRow>(),
    admin.from('users').select('is_admin').eq('id', userId).maybeSingle<{ is_admin: boolean | null }>(),
  ]);
  if (gameRes.error) throw new Error(`markerReviewAccess: ${gameRes.error.message}`);
  if (cardRes.error) throw new Error(`markerReviewAccess: ${cardRes.error.message}`);
  if (profileRes.error) throw new Error(`markerReviewAccess: ${profileRes.error.message}`);
  const game = gameRes.data;
  const card = cardRes.data;
  if (!game || !card) return { ok: false, reason: 'not_found' };

  const role = mayApproveAsMarker({
    approverId: userId,
    markerUserId: card.marker_user_id,
    ownerId: card.user_id,
    submittedBy: card.submitted_by_user_id,
    leagueCreatorId: flight.leagueCreatorId,
    approverIsAdmin: profileRes.data?.is_admin === true,
  });
  if (!role) return { ok: false, reason: 'forbidden' };

  let markerName: string | null = null;
  if (card.marker_user_id) {
    const { data: marker, error } = await admin
      .from('users')
      .select('name, nickname')
      .eq('id', card.marker_user_id)
      .maybeSingle<{ name: string | null; nickname: string | null }>();
    if (error) throw new Error(`markerReviewAccess: ${error.message}`);
    markerName = displayName(marker);
  }

  const state: MarkerCardState =
    card.withdrawn_at != null
      ? 'withdrawn'
      : card.approved_at != null
        ? 'approved'
        : card.submitted_at == null
          ? 'not_delivered'
          : game.status !== 'active'
            ? 'closed'
            : 'pending';

  return {
    ok: true,
    role,
    flight,
    game: { name: game.name, status: game.status, gameMode: game.game_mode, courseId: game.course_id },
    card: {
      userId: card.user_id,
      name: displayName(card.users),
      markerUserId: card.marker_user_id,
      markerName,
      submittedAt: card.submitted_at,
      approvedAt: card.approved_at,
      teeGender: card.tee_gender,
      courseHandicap: card.course_handicap,
    },
    state,
  };
}

/** One hole on the marker's card: the owner's par, the index and the strokes. */
export type MarkerCardHole = {
  number: number;
  par: number;
  strokeIndex: number;
  strokes: number | null;
};

/**
 * The holes and the owner's strokes for the card the gate let through. A
 * league flight is solo, so the owner's own score rows are the card. Read
 * with the service role, after `markerReviewAccess`. A failed read throws.
 */
export async function loadMarkerCardHoles(
  review: Extract<MarkerReview, { ok: true }>,
): Promise<MarkerCardHole[]> {
  const admin = getAdminClient();
  const [holesRes, scoresRes] = await Promise.all([
    admin
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', review.game.courseId)
      .order('hole_number', { ascending: true }),
    admin
      .from('scores')
      .select('hole_number, strokes')
      .eq('game_id', review.flight.gameId)
      .eq('user_id', review.card.userId),
  ]);
  if (holesRes.error) throw new Error(`loadMarkerCardHoles: ${holesRes.error.message}`);
  if (scoresRes.error) throw new Error(`loadMarkerCardHoles: ${scoresRes.error.message}`);
  const strokesByHole = new Map(
    ((scoresRes.data ?? []) as { hole_number: number; strokes: number | null }[]).map((s) => [
      s.hole_number,
      s.strokes,
    ]),
  );
  return (
    (holesRes.data ?? []) as {
      hole_number: number;
      par_mens: number;
      par_ladies: number;
      par_juniors: number;
      stroke_index: number;
    }[]
  ).map((h) => ({
    number: h.hole_number,
    par: parForPlayer({ mens: h.par_mens, ladies: h.par_ladies, juniors: h.par_juniors }, review.card.teeGender),
    strokeIndex: h.stroke_index,
    strokes: strokesByHole.get(h.hole_number) ?? null,
  }));
}
