import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildNassauContext } from '@/lib/scoring/context/buildNassauContext';
import { NassauHolesView } from '../NassauHolesView';
import type { NassauPlayerInfo } from '../../NassauView';
import {
  getDrilldownContext,
  localizeHolesGameName,
  fetchHolesAndScores,
} from '../holesData';

/**
 * Nassau «Hull for hull» (epic #496, PR 7). Som SkinsHolesBody (solo, ingen
 * ekstra fetch utover scores — Nassaus tre seksjoner er ren funksjon av
 * scores), men bygger konteksten via den delte `buildNassauContext`-helperen og
 * rendrer den seksjons-tro per-hull-visningen (For 9 / Bak 9 / Totalt).
 */
export async function NassauHolesBody({
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

  const ctx = buildNassauContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHoles,
    scoresRows: rawScores,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'nassau') notFound();

  const playersById = new Map<string, NassauPlayerInfo>();
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
    <NassauHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}
