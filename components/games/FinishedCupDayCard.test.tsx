import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FinishedCupDayCard } from './FinishedCupDayCard';
import { toFinishedEntries } from '@/lib/games/finishedEntries';
import type {
  FinishedGame,
  FinishedTournament,
} from '@/lib/games/getFinishedGamesForUser';
import type { HoleSegment } from '@/lib/scoring';

/**
 * Type C render-test (one per component): the cup-day card links to the cup
 * page and renders the owner-decision-4 badge — gold accent on a win, neutral
 * (a plain arrow, no result) while the cup is unfinished. The won/lost/delt
 * mapping itself is covered in `finishedEntries` (Type A).
 */
function host(
  segment: HoleSegment,
  id: string,
  tournament: FinishedTournament,
  teamNumber: number,
): FinishedGame {
  return {
    id,
    name: `${tournament.name} – ${segment}`,
    ended_at: '2026-06-12T18:00:00Z',
    game_mode: 'best_ball',
    mode_config: { kind: 'best_ball', team_size: 2 } as FinishedGame['mode_config'],
    courses: { name: 'Byneset' },
    result_summary: null,
    tournament_id: 't1',
    hole_segment: segment,
    team_number: teamNumber,
    tournament,
  };
}

function cupDayEntry(tournament: FinishedTournament, myTeam: number) {
  const entry = toFinishedEntries([
    host('front9', 'f', tournament, myTeam),
    host('back9', 'b', tournament, myTeam),
  ])[0];
  if (entry.kind !== 'cupDay') throw new Error('expected a cupDay entry');
  return entry;
}

const FINISHED_TEAM1_WON: FinishedTournament = {
  name: 'Ryder-kompisene',
  status: 'finished',
  winner_team: 1,
  team_1_name: 'Blå',
  team_2_name: 'Rød',
};

describe('FinishedCupDayCard', () => {
  it('links to the cup page and titles the card with the cup name', () => {
    const { container } = render(
      <FinishedCupDayCard entry={cupDayEntry(FINISHED_TEAM1_WON, 1)} />,
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/cup/t1');
    expect(container.textContent).toContain('Ryder-kompisene');
    expect(container.textContent).toContain('Cup-dag');
  });

  it('my team won → gold-accent won badge', () => {
    const { container } = render(
      <FinishedCupDayCard entry={cupDayEntry(FINISHED_TEAM1_WON, 1)} />,
    );
    const accent = container.querySelector('.text-accent');
    expect(accent?.textContent).toContain('vant cupen');
  });

  it('unfinished cup → neutral card, no win/loss result text', () => {
    const ongoing: FinishedTournament = { ...FINISHED_TEAM1_WON, status: 'active', winner_team: null };
    const { container } = render(
      <FinishedCupDayCard entry={cupDayEntry(ongoing, 1)} />,
    );
    expect(container.textContent).not.toContain('vant cupen');
    expect(container.textContent).not.toContain('tapte cupen');
  });
});
