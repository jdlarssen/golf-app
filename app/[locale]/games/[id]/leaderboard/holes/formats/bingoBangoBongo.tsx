import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildBingoBangoBongoContext } from '@/lib/scoring/context/buildBingoBangoBongoContext';
import { getBingoBangoBongoHoles } from '@/lib/bbb/getBingoBangoBongoHoles';
import { BingoBangoBongoHolesView } from '../BingoBangoBongoHolesView';
import type { BingoBangoBongoPlayerInfo } from '../../BingoBangoBongoView';
import {
  getDrilldownContext,
  localizeHolesGameName,
  fetchHolesAndScores,
} from '../holesData';

/**
 * Bingo Bango Bongo «Hull for hull» (epic #496, PR 6). Som WolfHolesBody: henter
 * per-hull-prestasjonsdata fra `bingo_bango_bongo_holes` (`getBingoBangoBongoHoles`,
 * tag-cachet) og injiserer dem i konteksten via `buildBingoBangoBongoContext`.
 * BBB teller ikke slag — `rawScores` sendes gjennom for shape-konsistens men
 * ignoreres av scoring-laget. Rendrer den prestasjons-først per-hull-visningen.
 */
export async function BingoBangoBongoHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [{ gwp, rawHoles, rawScores }, bingoBangoBongoHoles] =
    await Promise.all([
      fetchHolesAndScores(supabase, gameId, courseId),
      getBingoBangoBongoHoles(gameId),
    ]);

  const game = gwp.game;

  const ctx = buildBingoBangoBongoContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHoles,
    scoresRows: rawScores,
    bingoBangoBongoHoles,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'bingo_bango_bongo') notFound();

  const playersById = new Map<string, BingoBangoBongoPlayerInfo>();
  for (const p of gwp.players) {
    if (p.users == null) continue;
    playersById.set(p.user_id, {
      name: p.users.name ?? tCommon('unknownPlayer'),
      nickname: p.users.nickname,
    });
  }

  const scoreVisibility: 'live' | 'reveal' =
    game.score_visibility === 'reveal' ? 'reveal' : 'live';
  const gameStatus: 'active' | 'finished' =
    game.status === 'finished' ? 'finished' : 'active';

  return (
    <BingoBangoBongoHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}
