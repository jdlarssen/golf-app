import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { PlayerOption } from '../GameForm';
import { useGameFormState } from '../useGameFormState';
import { PlayerPickerGrid } from './PlayerPickerGrid';

// One Type C render test for the step 4 card grid (#2321): the cards are
// checkboxes named after the player, the selected ones are checked, the rest
// are disabled once the format's cap is reached, and «+ Gjest» starts closed.
// Looks are compared with the artboard on staging, not here.

const PLAYERS: PlayerOption[] = ['u0', 'u1', 'u2', 'u3'].map((id, i) => ({
  id,
  name: `Spiller ${i + 1}`,
  nickname: null,
  hcp_index: 10 + i,
  pending: false,
  gender: null,
  level: 'normal',
}));

function Harness() {
  const state = useGameFormState({
    players: PLAYERS,
    courses: [],
    initialValues: {
      game_mode: 'singles_matchplay',
      players: [
        { user_id: 'u0', team_number: 1, flight_number: null },
        { user_id: 'u1', team_number: 2, flight_number: null },
      ],
    },
  });
  return (
    <PlayerPickerGrid
      state={state}
      selectableIds={new Set(PLAYERS.map((p) => p.id))}
      source="friends"
      cap={2}
      allowEmail
    />
  );
}

describe('PlayerPickerGrid', () => {
  it('one checkbox per player, the selected checked, the rest disabled at the cap, «+ Gjest» closed', () => {
    render(<Harness />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByRole('checkbox', { name: /spiller 1 — hcp 10,0/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /spiller 2/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /spiller 3/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /spiller 3/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /spiller 2/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /legg til gjest/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
