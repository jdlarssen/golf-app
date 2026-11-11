import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getAdminClient } from '@/lib/supabase/admin';
import { COURSE_HOLES_SELECT } from '@/lib/supabase/queryFragments';
import type { TeeGender } from '@/lib/games/teeRating';
import type { ScorecardHole } from '@/lib/games/scorecardReviewData';
import { playerName } from '@/lib/names/playerName';
import { canViewLeague } from './canViewLeague';
import { countingCards } from './countingCards';
import { readLeagueFlight, type LeagueFlight } from './leagueFlight';
import { computeFlightCard } from './roundScoring';
import type { LeagueCardResponse } from './appLeagueView';
import type { LeagueFormat, StandingsMetric } from './types';

// The door to a card behind a cell in the season table (#2815).
//
// A league mate is usually not in the flight, and RLS on games, game_players
// and scores shows a finished game only to its players (#1542). So the card
// is read here with the service role, behind this gate, the way
// `getLigaSnapshot` reads the whole table and `markerReviewAccess` the
// marker's card. No select policy is widened.
//
// The gate lets a caller through when all of this holds:
//  - the game is a flight in the league named in the address;
//  - the caller may see the league (`canViewLeague`, the rule the league page
//    and the app's league route read; the membership is read as the caller);
//  - the card counts in the table (`countingCards`, the rule `getLigaSnapshot`
//    scores with), so a card the table did not count is never shown.
// Everything else is `not_found`, as if the card did not exist. The web page
// and the app's route read this one answer.
//
// A failed read throws (the page's error boundary, the route's 500), never
// «not found»: a database that does not answer is not a no.

type CardRow = {
  user_id: string;
  course_handicap: number | null;
  tee_gender: TeeGender;
  submitted_at: string | null;
  approved_at: string | null;
  withdrawn_at: string | null;
  users: { name: string | null; nickname: string | null } | null;
};

export type LeagueCardAccess =
  | {
      ok: true;
      flight: LeagueFlight;
      format: LeagueFormat;
      /** The table's axis: gross in a gross league, net otherwise (as `buildAppLeagueView`). */
      metric: StandingsMetric;
      game: { courseId: string | null; teeBoxId: string | null };
      card: CardRow;
    }
  | { ok: false; reason: 'not_found' };

const NOT_FOUND = { ok: false, reason: 'not_found' } as const;

/** May `callerId` see `playerUserId`'s card in `gameId`, in the league `leagueId`? */
export async function leagueCardAccess(
  caller: SupabaseClient<Database>,
  input: { callerId: string; leagueId: string; gameId: string; playerUserId: string },
): Promise<LeagueCardAccess> {
  const { callerId, leagueId, gameId, playerUserId } = input;
  const flight = await readLeagueFlight(gameId);
  if (!flight || flight.leagueId !== leagueId) return NOT_FOUND;

  const admin = getAdminClient();
  const [leagueRes, meRes] = await Promise.all([
    admin
      .from('leagues')
      .select('group_id, format, scoring')
      .eq('id', leagueId)
      .maybeSingle<{ group_id: string | null; format: string; scoring: string }>(),
    admin
      .from('league_players')
      .select('user_id')
      .eq('league_id', leagueId)
      .eq('user_id', callerId)
      .maybeSingle<{ user_id: string }>(),
  ]);
  if (leagueRes.error) throw new Error(`leagueCardAccess: ${leagueRes.error.message}`);
  if (meRes.error) throw new Error(`leagueCardAccess: ${meRes.error.message}`);
  const league = leagueRes.data;
  if (!league) return NOT_FOUND;

  const { allowed } = await canViewLeague(caller, {
    groupId: league.group_id,
    userId: callerId,
    isParticipant: meRes.data !== null,
  });
  if (!allowed) return NOT_FOUND;

  // The flight's cards are read only for a caller who may see the league.
  const [gameRes, playersRes] = await Promise.all([
    admin
      .from('games')
      .select('status, course_id, tee_box_id')
      .eq('id', gameId)
      .maybeSingle<{ status: string; course_id: string | null; tee_box_id: string | null }>(),
    admin
      .from('game_players')
      .select(
        'user_id, course_handicap, tee_gender, submitted_at, approved_at, withdrawn_at, users!game_players_user_id_fkey(name, nickname)',
      )
      .eq('game_id', gameId)
      .returns<CardRow[]>(),
  ]);
  if (gameRes.error) throw new Error(`leagueCardAccess: ${gameRes.error.message}`);
  if (playersRes.error) throw new Error(`leagueCardAccess: ${playersRes.error.message}`);
  const game = gameRes.data;
  if (!game) return NOT_FOUND;

  const card = countingCards(game.status, playersRes.data ?? [], flight.isSimulator).find(
    (p) => p.user_id === playerUserId,
  );
  if (!card) return NOT_FOUND;

  return {
    ok: true,
    flight,
    // DB CHECK (0087) allows the three formats only.
    format: league.format as LeagueFormat,
    metric: league.scoring === 'gross' ? 'gross' : 'net',
    game: { courseId: game.course_id, teeBoxId: game.tee_box_id },
    card,
  };
}

/**
 * The card the gate let through, on the table's axis, read with the service
 * role: the course's holes (all of them, as `getLigaSnapshot` scores the
 * flight), the tee's par and the owner's strokes. `computeFlightCard` scores
 * it with the table's own engine, so the value is the number in the cell.
 * Null when the table has no value for the card (an incomplete card, a flight
 * without course or tee): the caller answers «not found». A failed read
 * throws.
 *
 * `holes` and `teeGender` are for the web's `ScorecardTable`.
 */
export async function loadLeagueCard(
  access: Extract<LeagueCardAccess, { ok: true }>,
): Promise<{ card: LeagueCardResponse; holes: ScorecardHole[]; teeGender: TeeGender } | null> {
  const { flight, game, card } = access;
  if (!game.courseId || !game.teeBoxId) return null;

  const admin = getAdminClient();
  const [holesRes, teeRes, scoresRes] = await Promise.all([
    admin
      .from('course_holes')
      .select(COURSE_HOLES_SELECT)
      .eq('course_id', game.courseId)
      .order('hole_number', { ascending: true })
      .returns<ScorecardHole[]>(),
    admin
      .from('tee_boxes')
      .select('par_total_mens, par_total_ladies, par_total_juniors')
      .eq('id', game.teeBoxId)
      .maybeSingle<{ par_total_mens: number | null; par_total_ladies: number | null; par_total_juniors: number | null }>(),
    admin
      .from('scores')
      .select('hole_number, strokes')
      .eq('game_id', flight.gameId)
      .eq('user_id', card.user_id)
      .returns<{ hole_number: number; strokes: number | null }[]>(),
  ]);
  if (holesRes.error) throw new Error(`loadLeagueCard: ${holesRes.error.message}`);
  if (teeRes.error) throw new Error(`loadLeagueCard: ${teeRes.error.message}`);
  if (scoresRes.error) throw new Error(`loadLeagueCard: ${scoresRes.error.message}`);
  const holes = holesRes.data ?? [];
  if (holes.length === 0) return null;
  const tee = teeRes.data;
  const teePar = tee
    ? { mens: tee.par_total_mens, ladies: tee.par_total_ladies, juniors: tee.par_total_juniors }[card.tee_gender]
    : null;

  const scored = computeFlightCard(
    {
      format: access.format,
      gameId: flight.gameId,
      players: [
        {
          userId: card.user_id,
          teamNumber: 1,
          flightNumber: 1,
          courseHandicap: card.course_handicap ?? 0,
          teeGender: card.tee_gender,
        },
      ],
      holes: holes.map((h) => ({
        number: h.hole_number,
        par: h.par_mens,
        parByGender: { mens: h.par_mens, ladies: h.par_ladies, juniors: h.par_juniors },
        strokeIndex: h.stroke_index,
      })),
      scores: (scoresRes.data ?? []).map((s) => ({
        userId: card.user_id,
        holeNumber: s.hole_number,
        gross: s.strokes,
      })),
      parByUser: new Map([[card.user_id, teePar ?? null]]),
      deliveredOutsideWindow: false,
      finishedAt: null,
    },
    card.user_id,
    access.metric,
  );
  if (!scored) return null;

  return {
    card: {
      leagueId: flight.leagueId,
      leagueName: flight.leagueName,
      roundLabel: flight.roundLabel,
      gameId: flight.gameId,
      player: { userId: card.user_id, name: playerName(card.users) },
      format: access.format,
      axis: access.metric,
      playingHandicap: scored.playingHandicap,
      value: scored.value,
      grid: scored.grid,
    },
    holes,
    teeGender: card.tee_gender,
  };
}
