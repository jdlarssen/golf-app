import type { ArrangedGame, ArrangedRosterRow } from '../arrangedGames';

/**
 * One home for the «Rundene dine» test rows (#2269): a standalone, invite-only
 * game with no times set, and a roster row that has done nothing yet. Tests
 * override what they assert on.
 */
export function arrangedGame(
  over: Partial<ArrangedGame> & Pick<ArrangedGame, 'id'>,
): ArrangedGame {
  return {
    name: `Runde ${over.id}`,
    status: 'scheduled',
    created_at: '2026-09-01T10:00:00Z',
    started_at: null,
    ended_at: null,
    scheduled_tee_off_at: null,
    require_peer_approval: false,
    registration_mode: 'invite_only',
    signups_closed_at: null,
    group_id: null,
    courses: null,
    ...over,
  };
}

export function arrangedRosterRow(
  gameId: string,
  over: Partial<Omit<ArrangedRosterRow, 'game_id'>> = {},
): ArrangedRosterRow {
  return { game_id: gameId, submitted_at: null, approved_at: null, withdrawn_at: null, ...over };
}
