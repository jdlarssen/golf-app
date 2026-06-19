import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { computeLeaderboard as computeModeResult } from '@/lib/scoring';
import { buildSkinsContext } from '@/lib/scoring/context/buildSkinsContext';
import { SkinsHolesView } from '../SkinsHolesView';
import type { SkinsPlayerInfo } from '../../SkinsView';
import {
  getDrilldownContext,
  localizeHolesGameName,
  fetchHolesAndScores,
} from '../holesData';

/**
 * Skins «Hull for hull» (epic #496). Henter samme rå-data som DrilldownBody,
 * men bygger Skins-konteksten via den delte `buildSkinsContext`-helperen,
 * kjører mode-router-en og rendrer den Skins-riktige per-hull-visningen i
 * stedet for lag-scorekortet. Ingen front-9-clip — Skins viser alle hull
 * (carryover er sekvensiell over hele runden), likt SkinsView.
 */
export async function SkinsHolesBody({
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

  const ctx = buildSkinsContext({
    gameId,
    modeConfig: game.mode_config,
    players: gwp.players,
    holesRows: rawHoles,
    scoresRows: rawScores,
  });

  const result = computeModeResult(ctx);
  if (result.kind !== 'skins') notFound();

  const playersById = new Map<string, SkinsPlayerInfo>();
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
    <SkinsHolesView
      gameId={gameId}
      gameName={await localizeHolesGameName(game)}
      result={result}
      playersById={playersById}
      scoreVisibility={scoreVisibility}
      gameStatus={gameStatus}
    />
  );
}
