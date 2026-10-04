import type { getServerClient } from '@/lib/supabase/server';
import { isOnboardingGameOpen } from '@/lib/games/onboardingGame';
import type { GameModeConfig } from '@/lib/scoring/modes/types';

type ServerClient = Awaited<ReturnType<typeof getServerClient>>;

/** What the card on «Fullfør profilen» shows. */
export type OnboardingGameCardData = {
  gameId: string;
  name: string;
  courseName: string | null;
  teeOffAt: string | null;
  gameMode: string;
  modeConfig: GameModeConfig;
};

type OnboardingGameRow = {
  withdrawn_at: string | null;
  games: {
    id: string;
    name: string;
    status: string;
    game_mode: string;
    mode_config: GameModeConfig;
    scheduled_tee_off_at: string | null;
    source_game_id: string | null;
    courses: { name: string } | null;
  } | null;
};

/**
 * The round from `next=/games/<id>` for the card on «Fullfør profilen»
 * (#2350), or `null`.
 *
 * The `.eq('user_id', userId)` filter is what guards this read: only the
 * player's own `game_players` row can match, so a crafted `next` for a round
 * they are not on finds nothing. RLS is not what stands behind it — it lets
 * co-players' rows in a shared game through too. Read with the request
 * client, never the admin client. The card is decoration on a step that must
 * work without it, so an error is `null` and a log line, never a thrown page.
 */
export async function getOnboardingGame(
  supabase: ServerClient,
  userId: string,
  gameId: string,
): Promise<OnboardingGameCardData | null> {
  const { data, error } = await supabase
    .from('game_players')
    .select(
      'withdrawn_at, games!game_players_game_id_fkey(id, name, status, game_mode, mode_config, scheduled_tee_off_at, source_game_id, courses(name))',
    )
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle<OnboardingGameRow>();

  if (error) {
    console.error('[complete-profile] onboarding game lookup failed', error.message);
    return null;
  }
  const game = data?.games;
  if (!data || !game) return null;
  if (
    !isOnboardingGameOpen({
      withdrawn_at: data.withdrawn_at,
      status: game.status,
      source_game_id: game.source_game_id,
    })
  ) {
    return null;
  }

  return {
    gameId: game.id,
    name: game.name,
    courseName: game.courses?.name ?? null,
    teeOffAt: game.scheduled_tee_off_at,
    gameMode: game.game_mode,
    modeConfig: game.mode_config,
  };
}
