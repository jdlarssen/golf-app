import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildStablefordContext } from '@/lib/scoring/context/buildStablefordContext';
import { SoloStablefordHolesView } from '../SoloStablefordHolesView';
import type { SoloStablefordPlayerInfo } from '../../SoloStablefordView';
import {
  getDrilldownContext,
  localizeHolesGameName,
  fetchHolesAndScores,
} from '../holesData';

/**
 * Solo / modified stableford «Hull for hull» (epic #496, PR 9). Som
 * SoloStrokeplayHolesBody, men bygger konteksten via `buildStablefordContext`
 * (game_mode-passthrough så modified får riktig poeng-tabell; eier WD #386-
 * filtrering). Kun solo-varianten (team_size === 1) ruter hit — par-stableford
 * faller til generisk visning. Rendrer det klassiske stableford-scorekortet.
 */
export async function SoloStablefordHolesBody({
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
  const stablefordMode: 'stableford' | 'modified_stableford' =
    game.game_mode === 'modified_stableford' ? 'modified_stableford' : 'stableford';

  const ctx = buildStablefordContext({
    gameId,
    gameMode: stablefordMode,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHoles,
    scoresRows: rawScores,
  });

  const result = computeModeResult(ctx);
  // Solo-flaten kun for solo-varianten. Team faller aldri hit (page-branchen
  // gater på team_size === 1), men vi narrower defensivt.
  if (result.kind !== 'stableford' || result.variant !== 'solo') notFound();

  const playersById = new Map<string, SoloStablefordPlayerInfo>();
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
    <SoloStablefordHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      formatLabel={
        stablefordMode === 'modified_stableford'
          ? 'Modifisert Stableford'
          : 'Stableford'
      }
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}
