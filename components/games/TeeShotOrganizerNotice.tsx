import 'server-only';
import { getTranslations } from 'next-intl/server';
import { getServerClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { readMinTeeShots } from '@/lib/games/teeShots';
import { readTeamTeeShotStatuses } from '@/lib/games/teeShotRead';
import type { GameMode } from '@/lib/scoring/modes/types';
import { sortByTeeShotName, teeShotNames, teeShotOrganizerLines, type TeeShotT } from './teeShotCopy';

/**
 * #2580 «Hvem sitt utslag» on the organiser's pages: «Per har 2 av 4 utslag»
 * for every player under the minimum, team by team. The one home for the four
 * pages that show it (admin status, admin «Avslutt», admin «Avslutt likevel»
 * and the organiser's own «Avslutt»). Renders nothing when the game does not
 * have the setting, or nobody is short.
 *
 * The game and `team_tee_shots` are read with the ordinary server client: the
 * SELECT policy lets the creator in (`is_game_creator_or_admin`), so an
 * organiser who neither plays nor is admin sees the rows too. The roster with
 * names comes from the admin client, as those pages read it; each page has
 * checked the caller (admin, or admin-or-creator) before it renders this.
 */
export async function TeeShotOrganizerNotice({
  gameId,
  className = 'mb-4',
}: {
  gameId: string;
  /** Spacing around the block, to fit each page's rhythm. */
  className?: string;
}) {
  const supabase = await getServerClient();
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('game_mode, mode_config')
    .eq('id', gameId)
    .maybeSingle<{ game_mode: GameMode; mode_config: unknown }>();
  if (gameError) throw gameError;
  if (!game) return null;
  const minimum = readMinTeeShots(game.game_mode, game.mode_config);
  if (minimum === null) return null;

  const { data: roster, error: rosterError } = await getAdminClient()
    .from('game_players')
    .select('user_id, team_number, withdrawn_at, users!game_players_user_id_fkey(name, nickname)')
    .eq('game_id', gameId)
    .returns<
      {
        user_id: string;
        team_number: number | null;
        withdrawn_at: string | null;
        users: { name: string | null; nickname: string | null } | null;
      }[]
    >();
  if (rosterError) throw rosterError;

  const t = (await getTranslations('teeShots')) as unknown as TeeShotT;
  const tUnknown = await getTranslations('leaderboard.holes');
  const statuses = await readTeamTeeShotStatuses(
    supabase,
    gameId,
    minimum,
    sortByTeeShotName(roster ?? [], tUnknown('unknownPlayer')),
  );
  const showTeam = statuses.size > 1;

  const lines: { key: string; text: string }[] = [];
  for (const [team, status] of statuses) {
    if (status.canDeliver) continue;
    const names = teeShotNames(
      (roster ?? []).filter((r) => r.team_number === team),
      tUnknown('unknownPlayer'),
    );
    const nameOf = (uid: string) => names.get(uid) ?? tUnknown('unknownPlayer');
    teeShotOrganizerLines(status, nameOf, t).forEach((text, i) => {
      lines.push({
        key: `${team}:${i}`,
        text: showTeam ? `${t('teamLabel', { team })} · ${text}` : text,
      });
    });
  }
  if (lines.length === 0) return null;

  return (
    <div
      data-testid="tee-shot-organizer"
      className={`${className} rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-sm text-warning-text`}
    >
      {lines.map((line) => (
        <p key={line.key}>{line.text}</p>
      ))}
    </div>
  );
}
