import { NextResponse, type NextRequest } from 'next/server';
import { authenticatedUserId, callerScopedClient } from '@/lib/api/appAuth';
import { APP_CUP_UNKNOWN_PLAYER } from '@/lib/cup/buildAppCupView';
import { canViewCupPageAs } from '@/lib/cup/cupPageAccess';
import { getCupSnapshot } from '@/lib/cup/getCupSnapshot';
import {
  GAME_SELECT,
  PLAYER_SELECT,
  type CupMatchBoardResponse,
  type GameRow,
  type PlayerRow,
} from '@/lib/games/gameBundleRows';
import { nonPlayerGameDoor } from '@/lib/games/nonPlayerGameDoor';
import type { GameStatus } from '@/lib/games/status';
import { getAdminClient } from '@/lib/supabase/admin';
import { SCORES_SELECT } from '@/lib/supabase/queryFragments';
import { selectAllRowsResult } from '@/lib/supabase/selectAllRows';
import { isUuid } from '@/lib/url/isUuid';

// Tavla til en ferdig kamp du ikke spilte (#2752, eierens svar 02.11: «Knapp til
// tavla»). Nettet åpner den for alle innloggede (`/games/[id]/leaderboard`, #1456),
// og RLS gir en spiller bare egne kamper (#1542), så slagene leses med service role.
//
// ⚠️ PORTEN ER HÅNDHEVELSEN. Den gir ikke mer enn nettet:
//   - bare en FERDIG kamp (`nonPlayerGameDoor`, samme regel som nettsiden). En kamp
//     som pågår, er 404, også for arrangøren: den veien går spillets egen tavle.
//   - bare i en cup kalleren får se (`canViewCupPageAs`, strengere enn nettets tavle
//     for en klubb-cup, siden rommet er eneste vei hit).
//   - feltene tavla ikke viser, sendes ikke: marker, avslag, hvem som leverte og
//     godkjente, delingslenka og rundereferatet.
//
// WIRE (`lib/games/gameBundleRows.ts`):
//   GET 200 CupMatchBoardResponse · 401 unauthorized · 404 not_found · 500 load_failed

type RouteContext = { params: Promise<{ id: string; gameId: string }> };

const NOT_FOUND = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

export async function GET(request: NextRequest, ctx: RouteContext) {
  try {
    const { id, gameId } = await ctx.params;
    const userId = await authenticatedUserId(request);
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (!isUuid(id) || !isUuid(gameId)) return NOT_FOUND();

    const snapshot = await getCupSnapshot(id, APP_CUP_UNKNOWN_PLAYER);
    if (!snapshot) return NOT_FOUND();
    const caller = callerScopedClient(request);
    if (!caller) throw new Error('caller-scoped client unavailable');
    const allowed = await canViewCupPageAs(caller, {
      tournamentId: id,
      groupId: snapshot.tournament.group_id,
      roster: snapshot.roster,
      userId,
    });
    if (!allowed) return NOT_FOUND();

    const admin = getAdminClient();
    const { data: game, error: gameError } = await admin
      .from('games')
      .select(GAME_SELECT)
      .eq('id', gameId)
      .eq('tournament_id', id)
      .maybeSingle<GameRow>();
    if (gameError) throw gameError;
    if (!game) return NOT_FOUND();
    const door = nonPlayerGameDoor({
      gameId,
      isAdmin: false,
      isCreator: false,
      surface: 'board',
      status: game.status as GameStatus,
    });
    if (door.kind !== 'board') return NOT_FOUND();

    const scoresGameId = game.source_game_id ?? game.id;
    const [playersRes, scoresRes, sourceRes] = await Promise.all([
      admin.from('game_players').select(PLAYER_SELECT).eq('game_id', gameId).returns<PlayerRow[]>(),
      selectAllRowsResult(
        (from, to) =>
          admin.from('scores').select(SCORES_SELECT).eq('game_id', scoresGameId).order('id').range(from, to),
        'cup match board scores',
      ),
      game.source_game_id
        ? admin.from('games').select('name').eq('id', game.source_game_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (playersRes.error) throw playersRes.error;
    if (scoresRes.error) throw scoresRes.error;
    if (sourceRes.error) throw sourceRes.error;

    const body: CupMatchBoardResponse = {
      game: { ...game, spectate_token: null, round_report: null },
      players: (playersRes.data ?? []).map((player) => ({
        ...player,
        marker_user_id: null,
        rejection_reason: null,
        submitted_by_user_id: null,
        approved_by_user_id: null,
        withdrawn_by_user_id: null,
      })),
      sourceGameName: sourceRes.data?.name ?? null,
      scores: scoresRes.data ?? [],
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/cup/[id]/matches/[gameId]/board] load threw', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
