import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SideAwardsPanel } from './SideAwardsPanel';
import type { CupSideAwardSnapshot } from '@/lib/cup/getCupSnapshot';

// Type C render-test per docs/test-discipline.md — verifiserer at panelet
// veksler mellom redigerbar oppsett-visning og read-only-recap basert på
// `configEditable`, og at registrerings-seksjonen dukker opp når
// `showWinnerRegistration` er satt (vinner-dropdown for ctp/ld-slots,
// teller-felter for gir, #1489). Server-action-kall (lagre/registrer) er
// dekket av lib/cup/sideAwardActions.test.ts — denne testen mocker dem bort;
// config↔DB-rad-grupperingen er dekket av lib/cup/sideAwardRows.test.ts.

vi.mock('@/lib/cup/sideAwardActions', () => ({
  saveSideAwardConfig: vi.fn(async () => ({ ok: true })),
  registerSideAwardWinner: vi.fn(async () => ({ ok: true })),
  registerGirCounts: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const AWARDS: CupSideAwardSnapshot[] = [
  { id: 'a1', kind: 'ctp', holeNumber: 4, points: 2, slot: 1, slotCount: 1, winnerUserId: null, winnerTeam: null },
  { id: 'a2', kind: 'ld', holeNumber: 6, points: 3, slot: 1, slotCount: 1, winnerUserId: null, winnerTeam: null },
];

// #1489: 2×ctp-slots på samme hull + en gir-rad.
const SLOTTED_AWARDS: CupSideAwardSnapshot[] = [
  { id: 'b1', kind: 'ctp', holeNumber: 4, points: 2, slot: 1, slotCount: 2, winnerUserId: null, winnerTeam: null },
  { id: 'b2', kind: 'ctp', holeNumber: 4, points: 2, slot: 2, slotCount: 2, winnerUserId: null, winnerTeam: null },
  { id: 'b3', kind: 'gir', holeNumber: 3, points: 1.5, maxPerTeam: 3, team1Count: null, team2Count: null },
];

const ROSTER = [
  { userId: 'p1', label: 'Kari Nordmann (Ørnen)' },
  { userId: 'p2', label: 'Ola Hansen (Falken)' },
];

const BASE_PROPS = {
  tournamentId: 't-1',
  rosterOptions: ROSTER,
  team1Name: 'Nord',
  team2Name: 'Sør',
};

describe('SideAwardsPanel', () => {
  it('redigerbar modus: viser rader + legg-til/fjern, ingen vinner-seksjon uten showWinnerRegistration', () => {
    render(
      <SideAwardsPanel
        {...BASE_PROPS}
        initialAwards={AWARDS}
        configEditable
        showWinnerRegistration={false}
      />,
    );

    expect(screen.getByTestId('cup-side-awards')).toBeInTheDocument();
    // Two config rows rendered as number inputs (hole + points + winners per row).
    expect(screen.getAllByLabelText(/hull/i)).toHaveLength(2);
    expect(screen.getAllByLabelText(/vinnere/i)).toHaveLength(2);
    expect(screen.getByRole('button', { name: /legg til sidepoeng/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /etter runden/i })).not.toBeInTheDocument();

    // Add a row → three hole-inputs now.
    fireEvent.click(screen.getByRole('button', { name: /legg til sidepoeng/i }));
    expect(screen.getAllByLabelText(/hull/i)).toHaveLength(3);
  });

  it('read-only modus + vinner-registrering: recap-liste og én vinner-dropdown per innslag', () => {
    render(
      <SideAwardsPanel
        {...BASE_PROPS}
        initialAwards={AWARDS}
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

  it('slots + gir (#1489): slot-rader nummereres «(1 av 2)», gir-raden får teller-felt i stedet for dropdown', () => {
    render(
      <SideAwardsPanel
        {...BASE_PROPS}
        initialAwards={SLOTTED_AWARDS}
        configEditable={false}
        showWinnerRegistration
      />,
    );

    // Recap grupperer slot-radene til én linje («2 vinnere») + gir-linjen
    // («maks 3 per lag» står også i gir-registreringsraden → getAllByText).
    expect(screen.getByText(/2 vinnere/)).toBeInTheDocument();
    expect(screen.getAllByText(/maks 3 per lag/).length).toBeGreaterThan(0);

    // Registrering: to vinner-dropdowns (én per ctp-slot, nummerert), og to
    // GIR-teller-felt (ett per lag) med egen registrer-knapp.
    expect(screen.getAllByLabelText(/vinner/i)).toHaveLength(2);
    expect(screen.getByText(/\(1 av 2\)/)).toBeInTheDocument();
    expect(screen.getByText(/\(2 av 2\)/)).toBeInTheDocument();
    expect(screen.getByLabelText(/hvor mange gir klarte nord/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hvor mange gir klarte sør/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /registrer/i })).toHaveLength(3);
  });
});
