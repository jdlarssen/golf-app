import 'server-only';
import { readFriendIds } from '@/lib/friends/getFriendIds';
import type { AppTeamSignup, AppTeamSignupMember } from '@/lib/games/appRoundInviteView';
import type { ShortIdGame } from '@/lib/games/getGameByShortId';
import { TEAM_NAME_MAX, TEAM_NAME_MIN } from '@/lib/games/registration';
import { teamSignupFor, type SignupView } from '@/lib/games/signupOffer';
import { loadTeamDashboard } from '@/lib/games/teamDashboardCore';
import { suggestTeamName } from '@/lib/games/teamName';
import { resolveTeamSize } from '@/lib/games/teamRegistrationCore';
import { getAdminClient } from '@/lib/supabase/admin';

/**
 * The team part of `GET /api/pamelding/[shortId]` (#2840): what the app's team
 * form or its yes/no needs, and whether you have a team page in this round.
 * Read through the service role like `loadSignupFacts`, for the caller only:
 * `userId` comes from the verified token. A failed read throws, so the route
 * answers 500 instead of a form that greys out nobody.
 */

type OwnRequestRow = {
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  is_team_captain: boolean;
  team_request_id: string | null;
};

export async function loadAppTeamSignup(
  game: Pick<ShortIdGame, 'id' | 'short_id' | 'mode_config'>,
  userId: string,
  view: SignupView,
): Promise<{ teamSignup: AppTeamSignup | null; hasTeamPage: boolean }> {
  const hasTeamPage = await readHasTeamPage(game.id, userId);
  switch (teamSignupFor(view)) {
    case 'form':
      return { teamSignup: await loadForm(game, userId), hasTeamPage };
    case 'invited':
      return { teamSignup: await loadInvited(game.short_id, userId), hasTeamPage };
    case null:
      return { teamSignup: null, hasTeamPage };
  }
}

/**
 * A team row of your own that is still live: captain, or a teammate with a
 * captain. A no or a removal (`rejected`, `withdrawn`) is no team page.
 * ASSUMPTION (#2840): the web page would still open for those rows, but «Se
 * laget» on a team you left reads wrong.
 */
async function readHasTeamPage(gameId: string, userId: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('game_registration_requests')
    .select('status, is_team_captain, team_request_id')
    .eq('game_id', gameId)
    .eq('user_id', userId)
    .maybeSingle<OwnRequestRow>();
  if (error) throw error;
  if (!data || (data.status !== 'pending' && data.status !== 'approved')) return false;
  return data.is_team_captain || data.team_request_id != null;
}

async function loadForm(
  game: Pick<ShortIdGame, 'id' | 'mode_config'>,
  userId: string,
): Promise<AppTeamSignup | null> {
  // A team format without a size cannot take a team: the core answers
  // mode_does_not_support_teams, so the app keeps the website's button.
  const teamSize = resolveTeamSize(game.mode_config as { team_size?: number });
  if (teamSize === null) return null;

  const [firstName, unavailableFriendIds] = await Promise.all([
    readFirstName(userId),
    readUnavailableFriendIds(game.id, userId),
  ]);
  return {
    kind: 'form',
    teamSize,
    nameMin: TEAM_NAME_MIN,
    nameMax: TEAM_NAME_MAX,
    suggestedName: suggestTeamName(firstName),
    unavailableFriendIds,
  };
}

async function readFirstName(userId: string): Promise<string> {
  const { data, error } = await getAdminClient()
    .from('users')
    .select('name')
    .eq('id', userId)
    .maybeSingle<{ name: string | null }>();
  if (error) throw error;
  return data?.name?.trim().split(/\s+/)[0] ?? '';
}

/**
 * Your friends who are in the round already: on the list (not withdrawn), or
 * with a request of any status (#2840: a declined one still holds the row).
 * The game's rows are read whole and matched against the friends here, so a
 * long friend list never meets PostgREST's `.in()` URL limit; a round has at
 * most a few hundred rows. The team page's «Velg en venn» reads the same list
 * (`GET /api/pamelding/[shortId]/lag`).
 */
export async function readUnavailableFriendIds(gameId: string, userId: string): Promise<string[]> {
  const admin = getAdminClient();
  const [friendIds, players, requests] = await Promise.all([
    readFriendIds(userId),
    admin
      .from('game_players')
      .select('user_id')
      .eq('game_id', gameId)
      .is('withdrawn_at', null)
      .returns<{ user_id: string }[]>(),
    admin
      .from('game_registration_requests')
      .select('user_id')
      .eq('game_id', gameId)
      // #2840: any status. A declined or withdrawn request keeps the unique
      // (game_id, user_id) row, so that friend cannot be picked again either.
      .returns<{ user_id: string }[]>(),
  ]);
  if (players.error) throw players.error;
  if (requests.error) throw requests.error;

  const taken = new Set([...(players.data ?? []), ...(requests.data ?? [])].map((r) => r.user_id));
  return friendIds.filter((id) => taken.has(id));
}

/**
 * The team page's own read (`loadTeamDashboard`), so the names are masked the
 * way the page masks them. Anything but a teammate's view (a race with the
 * captain removing you) is no yes/no.
 */
async function loadInvited(shortId: string, userId: string): Promise<AppTeamSignup | null> {
  const team = await loadTeamDashboard(shortId, userId);
  if (team.kind !== 'member') return null;
  const members: AppTeamSignupMember[] = [
    ...(team.captain
      ? [{ name: team.captain.displayName, isCaptain: true, isYou: false, status: team.captain.status }]
      : []),
    ...team.members.map((m) => ({
      name: m.displayName,
      isCaptain: false,
      isYou: m.requestId === team.myRowId,
      status: m.status,
    })),
  ];
  return {
    kind: 'invited',
    requestId: team.myRowId,
    captainName: team.captain?.displayName ?? null,
    teamName: team.teamName,
    joinEffect: team.game.joinEffect,
    members,
  };
}
