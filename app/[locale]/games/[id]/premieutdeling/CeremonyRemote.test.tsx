import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CeremonyRemote, type RemoteLabels, type RemoteStep } from './CeremonyRemote';

// Type C (#2298): the organiser's remote at a step from the database.

const setCeremonyStep = vi.fn(async (..._args: unknown[]): Promise<{ ok: boolean; current?: number | null }> => ({ ok: true }));
vi.mock('./actions', () => ({ setCeremonyStep: (...args: unknown[]) => setCeremonyStep(...args) }));
vi.mock('@/lib/games/spectate', () => ({ setLiveFollow: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const LABELS: RemoteLabels = {
  start: 'Start premieutdelingen',
  back: 'Ett steg tilbake',
  restart: 'Start på nytt',
  close: 'Lukk premieutdelingen',
  nowHidden: 'Vises nå: pallen med skjulte kort',
  notStarted: 'TV-en viser «Ferdig spilt» til du starter.',
  allShown: 'Alle kortene er snudd.',
  error: 'Fikk ikke kontakt. Prøv igjen.',
  tvMissing: 'Slå på storskjermen først.',
};

const STEPS: RemoteStep[] = [
  { button: 'Vis 2. plass', next: 'Neste: 2. plass · Jonas Berg · 36 poeng', now: 'Vises nå: 2. plass' },
  { button: 'Avslør vinneren', next: 'Neste: 1. plass · Silje Strand · 38 poeng', now: 'Vises nå: 1. plass' },
];

describe('CeremonyRemote', () => {
  it('in the middle: what is shown, what comes next, and the next tap', () => {
    render(<CeremonyRemote gameId="g1" initialStep={1} tvReady steps={STEPS} labels={LABELS} />);

    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Vises nå: 2. plass');
    expect(screen.getByTestId('ceremony-next')).toHaveTextContent('Silje Strand');
    expect(screen.getByTestId('ceremony-primary')).toHaveTextContent('Avslør vinneren');
  });

  it('a stored step beyond the podium (it shrank, or a direct PATCH) shows the end and can still close', () => {
    // RLS lets the step be 0–4; a two-step podium must not throw on 4.
    render(<CeremonyRemote gameId="g1" initialStep={4} tvReady steps={STEPS} labels={LABELS} />);

    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Vises nå: 1. plass');
    expect(screen.getByText('Alle kortene er snudd.')).toBeInTheDocument();
    expect(screen.queryByTestId('ceremony-primary')).toBeNull();
    expect(screen.getByTestId('ceremony-close')).toBeInTheDocument();
  });

  it('sends the step it shows; when it moved elsewhere, it takes the current one instead of writing over it', async () => {
    setCeremonyStep.mockResolvedValueOnce({ ok: false, current: 2 });
    render(<CeremonyRemote gameId="g1" initialStep={1} tvReady steps={STEPS} labels={LABELS} />);

    await act(async () => {
      fireEvent.click(screen.getByTestId('ceremony-primary'));
    });

    expect(setCeremonyStep).toHaveBeenCalledWith('g1', 1, 2);
    // Synced to the step another phone set: the end, no error line.
    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Vises nå: 1. plass');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('no TV link yet: a hint, and the next tap is off until the big screen is on', () => {
    render(<CeremonyRemote gameId="g1" initialStep={null} tvReady={false} steps={STEPS} labels={LABELS} />);

    expect(screen.getByTestId('ceremony-tv-missing')).toHaveTextContent('Slå på storskjermen først.');
    expect(screen.getByTestId('ceremony-primary')).toBeDisabled();
  });
});
