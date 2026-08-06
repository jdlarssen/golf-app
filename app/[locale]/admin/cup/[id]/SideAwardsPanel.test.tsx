import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SideAwardsPanel } from './SideAwardsPanel';
import type { CupSideAwardSnapshot } from '@/lib/cup/getCupSnapshot';

// Type C render-test per docs/test-discipline.md — verifiserer at panelet
// veksler mellom redigerbar oppsett-visning og read-only-recap basert på
// `configEditable`, og at vinner-seksjonen dukker opp når
// `showWinnerRegistration` er satt. Server-action-kall (lagre/registrer) er
// dekket av lib/cup/sideAwardActions.test.ts — denne testen mocker dem bort.

vi.mock('@/lib/cup/sideAwardActions', () => ({
  saveSideAwardConfig: vi.fn(async () => ({ ok: true })),
  registerSideAwardWinner: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const AWARDS: CupSideAwardSnapshot[] = [
  { id: 'a1', kind: 'ctp', holeNumber: 4, points: 2, winnerUserId: null, winnerTeam: null },
  { id: 'a2', kind: 'ld', holeNumber: 6, points: 3, winnerUserId: null, winnerTeam: null },
];

const ROSTER = [
  { userId: 'p1', label: 'Kari Nordmann (Ørnen)' },
  { userId: 'p2', label: 'Ola Hansen (Falken)' },
];

describe('SideAwardsPanel', () => {
  it('redigerbar modus: viser rader + legg-til/fjern, ingen vinner-seksjon uten showWinnerRegistration', () => {
    render(
      <SideAwardsPanel
        tournamentId="t-1"
        initialAwards={AWARDS}
        rosterOptions={ROSTER}
        configEditable
        showWinnerRegistration={false}
      />,
    );

    expect(screen.getByTestId('cup-side-awards')).toBeInTheDocument();
    // Two config rows rendered as number inputs (hole + points per row = 4 total).
    expect(screen.getAllByLabelText(/hull/i)).toHaveLength(2);
    expect(screen.getByRole('button', { name: /legg til sidepoeng/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /etter runden/i })).not.toBeInTheDocument();

    // Add a row → three hole-inputs now.
    fireEvent.click(screen.getByRole('button', { name: /legg til sidepoeng/i }));
    expect(screen.getAllByLabelText(/hull/i)).toHaveLength(3);
  });

  it('read-only modus + vinner-registrering: recap-liste og én vinner-dropdown per innslag', () => {
    render(
      <SideAwardsPanel
        tournamentId="t-1"
        initialAwards={AWARDS}
        rosterOptions={ROSTER}
        configEditable={false}
        showWinnerRegistration
      />,
    );

    // No editable hole-inputs in read-only mode.
    expect(screen.queryAllByLabelText(/^hull$/i)).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /etter runden/i })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/vinner/i)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /registrer/i })).toHaveLength(2);
  });
});
