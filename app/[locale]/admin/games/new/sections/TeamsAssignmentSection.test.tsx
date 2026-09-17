import { describe, it, expect } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen, within } from '@testing-library/react';
import { TeamsAssignmentSection } from './TeamsAssignmentSection';
import { useGameFormState, type GameFormState } from '../useGameFormState';
import type { CourseOption, PlayerOption } from '../GameForm';
import type { GameMode } from '@/lib/scoring/modes/types';
import type { TeamSize } from '../TeamSizeSelector';

// Type B render-test (#2148): the team grid grows with the selected players,
// up to the player cap, instead of stopping at four teams.

const COURSES: CourseOption[] = [
  {
    id: 'course-a',
    name: 'Bane A',
    tee_boxes: [
      { id: 'tee-a1', name: 'Gul', has_mens: true, has_ladies: true, has_juniors: true },
    ],
  },
];

const PLAYERS: PlayerOption[] = Array.from({ length: 40 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Spiller ${i + 1}`,
  nickname: null,
  hcp_index: 18,
  email: `p${i + 1}@example.test`,
  pending: false,
  gender: null,
  level: 'normal',
}));

let latest: GameFormState;

function Harness({ onState }: { onState: (state: GameFormState) => void }) {
  const state = useGameFormState({ players: PLAYERS, courses: COURSES });
  useEffect(() => onState(state));
  return <TeamsAssignmentSection state={state} players={PLAYERS} hideNumbering />;
}

function setup(mode: GameMode, teamSize: TeamSize, count: number) {
  render(
    <Harness
      onState={(state) => {
        latest = state;
      }}
    />,
  );
  act(() => latest.handleModeChange(mode));
  act(() => latest.handleTeamSizeChange(teamSize));
  act(() => {
    for (let i = 0; i < count; i++) latest.togglePlayer(`p${i + 1}`);
  });
}

describe('TeamsAssignmentSection — rutenettet vokser med valgte spillere (#2148)', () => {
  it('Texas à 2 med 10 valgte viser fem lagkort', () => {
    setup('texas_scramble', 2, 10);
    expect(screen.getByText('Lag 5')).toBeInTheDocument();
    expect(screen.queryByText('Lag 6')).toBeNull();
  });

  it('Texas à 4 med 40 valgte viser ti lagkort, og teksten sier ti lag', () => {
    setup('texas_scramble', 4, 40);
    expect(screen.getByText('Lag 10')).toBeInTheDocument();
    expect(screen.queryByText('Lag 11')).toBeNull();
    expect(screen.getByText(/Inntil 10 lag à 4 spillere/)).toBeInTheDocument();
  });

  it('best ball med 12 spillere trukket: seks par, flight-valg til og med 3', () => {
    setup('best_ball', 2, 12);
    act(() => latest.drawRandomTeams());
    expect(screen.getAllByText('Lag 6').length).toBeGreaterThan(0);
    expect(screen.queryByText('Lag 7')).toBeNull();
    const flightSelects = screen
      .getAllByRole('combobox')
      .filter((el) => within(el).queryByText('Flight 1') !== null);
    expect(flightSelects).toHaveLength(12);
    for (const select of flightSelects) {
      expect(within(select).getByText('Flight 3')).toBeInTheDocument();
      expect(within(select).queryByText('Flight 4')).toBeNull();
    }
    // Standard-flight følger to par per flight: lag 5 og 6 står i flight 3.
    expect(flightSelects.map((el) => (el as HTMLSelectElement).value).sort()).toEqual([
      '1', '1', '1', '1', '2', '2', '2', '2', '3', '3', '3', '3',
    ]);
  });
});
