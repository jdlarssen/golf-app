import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildSoloStrokeplayContext } from '@/lib/scoring/context/buildSoloStrokeplayContext';
import { SoloStrokeplayHolesView } from '../SoloStrokeplayHolesView';
import type { SoloStrokeplayPlayerInfo } from '../../SoloStrokeplayView';
import {
  getDrilldownContext,
  localizeHolesGameName,
  fetchHolesAndScores,
} from '../holesData';

/**
 * Solo strokeplay «Hull for hull» (epic #496, PR 8). Som NassauHolesBody (solo,
 * ingen ekstra fetch utover scores), men bygger konteksten via den delte
 * `buildSoloStrokeplayContext`-helperen — som også eier WD-filtreringen (#386)
 * av spillere + scorer, så «Hull for hull» og leaderboard ser samme felt.
 * Rendrer det klassiske per-spiller-scorekortet.
 */
export async function SoloStrokeplayHolesBody({
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

  const ctx = buildSoloStrokeplayContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHoles,
    scoresRows: rawScores,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'solo_strokeplay') notFound();

  const playersById = new Map<string, SoloStrokeplayPlayerInfo>();
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
    <SoloStrokeplayHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}
