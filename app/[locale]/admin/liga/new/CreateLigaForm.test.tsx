import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

// #924: companion to the LigaAddRound test — confirms the `season_over` code is
// recognized by the create form and renders the real Norwegian message (not the
// generic `errors.unexpected` fallback, which would surface the raw code). The
// action is mocked to return the code; the guard logic itself is unit-tested in
// lib/league/actions.test.ts.
vi.mock('@/lib/league/actions', () => ({
  createLeagueDraft: vi.fn(async () => ({ error: 'season_over' })),
}));

import { CreateLigaForm } from './CreateLigaForm';

describe('CreateLigaForm — #1475 form state survives a failed submit', () => {
  // React 19 auto-resets a <form action=...> when the action completes —
  // without the onSubmit guard the error banner arrives over a wiped form.
  it('keeps the typed name after the action returns an error', async () => {
    render(
      <CreateLigaForm
        courses={[]}
        players={[]}
        meId={null}
        defaultSeasonStart=""
        defaultSeasonEnd=""
      />,
    );
    const nameInput = screen.getByLabelText<HTMLInputElement>(/navn/i);
    fireEvent.change(nameInput, { target: { value: 'Torsdagsligaen' } });
    fireEvent.submit(screen.getByTestId('liga-create-form'));
    await screen.findByTestId('liga-create-error');
    expect(nameInput.value).toBe('Torsdagsligaen');
  });
});

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

describe('CreateLigaForm — handicap share and stroke cap (#2660)', () => {
  // The values reach FormData through always-mounted hidden inputs (#1011):
  // the visible fields unmount for a gross league. The parser's own rules are
  // locked in lib/league/actions.test.ts.
  it('follows the league type until touched, keeps the organiser’s values, and posts 100 for gross', () => {
    const { container } = render(
      <CreateLigaForm courses={[]} players={[]} meId={null} defaultSeasonStart="" defaultSeasonEnd="" />,
    );
    const posted = () => {
      const fd = new FormData(screen.getByTestId<HTMLFormElement>('liga-create-form'));
      return [fd.get('hcp_allowance_pct'), fd.get('hcp_max_strokes')];
    };
    const simulator = within(screen.getByTestId('liga-create-simulator')).getByRole('checkbox');

    expect(posted()).toEqual(['95', '']);
    fireEvent.click(simulator);
    expect(posted()).toEqual(['75', '32']);

    fireEvent.change(screen.getByLabelText('Handicap (%)'), { target: { value: '80' } });
    fireEvent.click(simulator);
    expect(posted()).toEqual(['80', '32']);

    fireEvent.change(screen.getByLabelText('Handicap (%)'), { target: { value: '101' } });
    expect(screen.getByTestId('liga-create-hcp-pct-error')).toHaveTextContent(
      'Handicapprosenten må være et helt tall fra 1 til 100.',
    );

    fireEvent.click(container.querySelector('input[name="_scoring_radio"][value="gross"]')!);
    expect(screen.queryByTestId('liga-create-hcp')).not.toBeInTheDocument();
    expect(posted()).toEqual(['100', '']);
  });
});
