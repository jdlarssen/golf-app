import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildWolfContext } from '@/lib/scoring/context/buildWolfContext';
import { getWolfChoices } from '@/lib/wolf/getWolfChoices';
import { WolfHolesView } from '../WolfHolesView';
import type { WolfPlayerInfo } from '../../WolfView';
import {
  getDrilldownContext,
  localizeHolesGameName,
  fetchHolesAndScores,
} from '../holesData';

/**
 * Wolf «Hull for hull» (epic #496, PR 2). Som SkinsHolesBody, men henter også
 * per-hull-valgene fra `wolf_hole_choices` (`getWolfChoices`, tag-cachet) og
 * injiserer dem i konteksten via `buildWolfContext`.
 */
export async function WolfHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const [{ gwp, rawHoles, rawScores }, wolfChoices] = await Promise.all([
    fetchHolesAndScores(supabase, gameId, courseId),
    getWolfChoices(gameId),
  ]);

  const game = gwp.game;

  const ctx = buildWolfContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHoles,
    scoresRows: rawScores,
    wolfChoices,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'wolf') notFound();

  const playersById = new Map<string, WolfPlayerInfo>();
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
    <WolfHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}
