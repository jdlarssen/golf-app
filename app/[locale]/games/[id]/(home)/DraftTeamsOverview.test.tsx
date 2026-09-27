import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Type C render-test (#2148): the draft overview lists every team the rows
// carry, not a fixed 1–4. #2207: a player without a finished profile shows as
// «Invitert spiller», never by e-post.

const rows = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock('./gameContext', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    returns: () => Promise.resolve({ data: rows.value, error: null }),
  };
  return {
    getGameContext: () => Promise.resolve({ supabase: { from: () => chain } }),
  };
});

import { DraftTeamsOverview } from './DraftTeamsOverview';

function row(userId: string, team: number, name: string | null = `${userId} Hansen`) {
  return { user_id: userId, team_number: team, users: { name } };
}

describe('DraftTeamsOverview — flere enn fire lag (#2148)', () => {
  it('rendrer lag 5 og 6 med overskrift', async () => {
    rows.value = [
      ...[1, 2, 3, 4, 5, 6].flatMap((team) => [row(`a${team}`, team), row(`b${team}`, team)]),
      row('pending', 6, null),
    ];
    const { container } = render(
      await DraftTeamsOverview({ gameId: 'g1', currentUserId: 'a1', isMatchplay: false }),
    );
    expect(screen.getByTestId('draft-team-heading-5')).toBeInTheDocument();
    expect(screen.getByTestId('draft-team-heading-6')).toBeInTheDocument();
    expect(screen.getByText("b6")).toBeInTheDocument();
    // The whole label, not firstName's «Invitert».
    expect(screen.getByText('Invitert spiller')).toBeInTheDocument();
    expect(container.textContent).not.toContain('@');
  });
});
