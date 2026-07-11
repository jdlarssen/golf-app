import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// #924: companion to the LigaAddRound test — confirms the `season_over` code is
// recognized by the create form and renders the real Norwegian message (not the
// generic `errors.unexpected` fallback, which would surface the raw code). The
// action is mocked to return the code; the guard logic itself is unit-tested in
// lib/league/actions.test.ts.
vi.mock('@/lib/league/actions', () => ({
  createLeagueDraft: vi.fn(async () => ({ error: 'season_over' })),
}));

import { CreateLigaForm } from './CreateLigaForm';

describe('CreateLigaForm — #924 season_over message', () => {
  it('renders the season-over message when the action returns season_over', async () => {
    render(
      <CreateLigaForm
        courses={[]}
        players={[]}
        meId={null}
        defaultSeasonStart=""
        defaultSeasonEnd=""
      />,
    );
    fireEvent.submit(screen.getByTestId('liga-create-form'));
    expect(
      await screen.findByText(
        'Sesongen er allerede over. Velg datoer fram i tid.',
      ),
    ).toBeInTheDocument();
    // Not the raw-code fallback (proves the code is recognized).
    expect(screen.queryByText(/Uventet feil:/)).not.toBeInTheDocument();
  });
});
