import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildRoundRobinContext } from '@/lib/scoring/context/buildRoundRobinContext';
import { RoundRobinHolesView } from '../RoundRobinHolesView';
import type { RoundRobinPlayerInfo } from '../../RoundRobinView';
import {
  getDrilldownContext,
  localizeHolesGameName,
  fetchHolesAndScores,
} from '../holesData';

/**
 * Round Robin «Hull for hull» (epic #496, PR 4). Som NinesHolesBody (ingen
 * ekstra fetch — rotasjonen er ren funksjon av slot + hull, scorer fra
 * scores-tabellen), men bygger Round Robin-konteksten via den delte
 * `buildRoundRobinContext`-helperen og rendrer den segment-grupperte,
 * roterende per-hull-visningen.
 */
export async function RoundRobinHolesBody({
  gameId,
  courseId,
}: {
  gameId: string;
  courseId: string;
}) {
  const { supabase } = await getDrilldownContext();
  const tCommon = await getTranslations('leaderboard.common');

  const { gwp, rawHoles, rawScores } = await fetchHolesAndScores(
    supabase,
    gameId,
    courseId,
  );

  const game = gwp.game;

  const ctx = buildRoundRobinContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHoles,
    scoresRows: rawScores,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'round_robin') notFound();

  const playersById = new Map<string, RoundRobinPlayerInfo>();
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
    <RoundRobinHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}
