import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SIM_SETTING_DEFAULTS } from '@/lib/league/simSettings';

// #2638 (the orchestrator's check of 8e8858cad, the CI race): while a save of
// the league default runs, the selects are disabled, so a choice made
// meanwhile cannot be thrown away by the remount after the save. The action
// never settles here, so the form stays in its saving state.
vi.mock('@/lib/league/actions', () => ({
  updateLeagueSimSettings: vi.fn(() => new Promise(() => {})),
}));

import { LigaSimDefaults } from './LigaSimDefaults';

describe('LigaSimDefaults — the fields wait out a save', () => {
  it('disables the selects while the save runs', async () => {
    render(<LigaSimDefaults leagueId="l1" initial={{ ...SIM_SETTING_DEFAULTS }} />);
    // Folded to one line by default (the owner 25.10); the fields are still in the form.
    expect(screen.getByTestId('liga-sim-defaults-disclosure')).not.toHaveAttribute('open');
    const selects = () => screen.getAllByRole('combobox', { hidden: true });
    const before = selects().filter((s) => s.matches(':disabled')).length;
    fireEvent.submit(selects()[0].closest('form')!);
    await waitFor(() => expect(screen.getByTestId('sim-select-wind')).toBeDisabled());
    // Gimme is disabled before too (Auto - Tour Pro locks it); every other select joins it.
    expect({ before, saving: selects().filter((s) => s.matches(':disabled')).length, all: selects().length }).toEqual({
      before: 1,
      saving: 8,
      all: 8,
    });
  });
});
