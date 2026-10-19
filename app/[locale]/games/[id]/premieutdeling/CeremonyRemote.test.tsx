import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CeremonyRemote, type RemoteLabels, type RemoteStep } from './CeremonyRemote';

// Type C (#2298): the organiser's remote at a step from the database.

vi.mock('./actions', () => ({ setCeremonyStep: vi.fn(async () => ({ ok: true })) }));
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
};

const STEPS: RemoteStep[] = [
  { button: 'Vis 2. plass', next: 'Neste: 2. plass · Jonas Berg · 36 poeng', now: 'Vises nå: 2. plass' },
  { button: 'Avslør vinneren', next: 'Neste: 1. plass · Silje Strand · 38 poeng', now: 'Vises nå: 1. plass' },
];

describe('CeremonyRemote', () => {
  it('in the middle: what is shown, what comes next, and the next tap', () => {
    render(<CeremonyRemote gameId="g1" initialStep={1} steps={STEPS} labels={LABELS} />);

    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Vises nå: 2. plass');
    expect(screen.getByTestId('ceremony-next')).toHaveTextContent('Silje Strand');
    expect(screen.getByTestId('ceremony-primary')).toHaveTextContent('Avslør vinneren');
  });

  it('a stored step beyond the podium (it shrank, or a direct PATCH) shows the end and can still close', () => {
    // RLS lets the step be 0–4; a two-step podium must not throw on 4.
    render(<CeremonyRemote gameId="g1" initialStep={4} steps={STEPS} labels={LABELS} />);

    expect(screen.getByTestId('ceremony-status')).toHaveTextContent('Vises nå: 1. plass');
    expect(screen.getByText('Alle kortene er snudd.')).toBeInTheDocument();
    expect(screen.queryByTestId('ceremony-primary')).toBeNull();
    expect(screen.getByTestId('ceremony-close')).toBeInTheDocument();
  });
});
