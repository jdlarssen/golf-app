import { getTranslations } from 'next-intl/server';
import { firstName } from '@/lib/firstName';
import { nameInitials } from '@/lib/names/initials';
import { getGameContext } from './gameContext';

type DraftRosterRow = {
  user_id: string;
  team_number: number;
  users: {
    // name is null until the invitee completes their profile — see
    // migration 0014. Draft games can carry pending placeholders, so
    // fall back to email when rendering.
    name: string | null;
    email: string;
  } | null;
};

export async function DraftTeamsOverview({
  gameId,
  currentUserId,
}: {
  gameId: string;
  currentUserId: string;
}) {
  const { supabase } = await getGameContext();
  const { data: rows } = await supabase
    .from('game_players')
    .select(
      'user_id, team_number, users!game_players_user_id_fkey(name, email)',
    )
    .eq('game_id', gameId)
    .order('team_number')
    .order('user_id')
    .returns<DraftRosterRow[]>();

  const players = rows ?? [];

  const tHome = await getTranslations('game.home');
  if (players.length === 0) {
    return (
      <p className="text-sm text-muted text-center py-4">{tHome('playersComingSoon')}</p>
    );
  }

  const teamsWithPlayers = [1, 2, 3, 4].filter((teamNum) =>
    players.some((p) => p.team_number === teamNum),
  );

  return (
    <ul className="flex flex-col gap-3">
      {teamsWithPlayers.map((teamNum) => {
        const teamPlayers = players.filter((p) => p.team_number === teamNum);
        return (
          <li key={teamNum}>
            <p className="text-xs text-muted uppercase tracking-[0.14em] font-semibold mb-1.5">
              {tHome('teamLabel2', { number: teamNum })}
            </p>
            <ul className="flex flex-col gap-1">
              {teamPlayers.map((p) => {
                const isCurrent = p.user_id === currentUserId;
                // Pending invitees (no profile yet) have null name — show
                // their email instead so the team layout reads usefully.
                const fullName = p.users?.name ?? p.users?.email ?? null;
                const displayName =
                  (fullName && firstName(fullName)) ??
                  fullName ??
                  tHome('unknownPlayer');
                return (
                  <li
                    key={p.user_id}
                    className={`flex items-center gap-2 text-[13.5px] ${
                      isCurrent ? 'font-semibold' : ''
                    }`}
                  >
                    <span
                      className={`shrink-0 w-6 h-6 rounded-full grid place-items-center font-serif text-[11px] font-medium ${
                        isCurrent
                          ? 'bg-primary text-white dark:text-bg'
                          : 'bg-surface text-text border border-border'
                      }`}
                    >
                      {nameInitials(fullName)}
                    </span>
                    <span className="truncate">
                      {displayName}
                      {isCurrent && (
                        <span className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.18em] text-accent ml-2">
                          {tHome('youLabel')}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
