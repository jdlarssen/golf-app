import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CupSetup } from './CupSetup';
import type { CupEligibleFormat } from '@/lib/formats/getFormatsForIntent';

// Én Type C render-test per docs/test-discipline.md — verifiserer at
// CupSetup viser lag-navn-felt, points-to-win, og multi-select for de
// passerte cup-eligible formats. Form action submits via createTournament-
// Draft (server-action) — vi sjekker DOM-struktur, ikke submit-flyt.

// Mock createTournamentDraft — vi binder action-en kun for type-safety,
// tester aldri faktisk submit her (det testes i lib/cup/actions.test).
vi.mock('@/lib/cup/actions', () => ({
  createTournamentDraft: vi.fn(async () => {}),
}));

const CUP_ELIGIBLE: CupEligibleFormat[] = [
  {
    slug: 'singles_matchplay',
    display_name: 'Matchplay',
    icon_key: 'singles_matchplay',
    short_description: '1v1, vinn flest hull.',
  },
  {
    slug: 'fourball_matchplay',
    display_name: 'Fourball matchplay',
    icon_key: 'fourball_matchplay',
    short_description: '2v2 best-ball matchplay.',
  },
];

describe('CupSetup', () => {
  it('viser lag-navn + points + multi-select med default-all valgt', () => {
    render(<CupSetup cupEligibleFormats={CUP_ELIGIBLE} />);

    expect(screen.getByLabelText(/cup-navn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^lag 1$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^lag 2$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/point-mål/i)).toBeInTheDocument();

    // Multi-select: begge default-valgt. Henter via id for å unngå
    // /matchplay/-regex som matcher to checkboxer.
    const singles = document.getElementById(
      'cup_format_singles_matchplay',
    ) as HTMLInputElement;
    const fourball = document.getElementById(
      'cup_format_fourball_matchplay',
    ) as HTMLInputElement;
    expect(singles).toBeChecked();
    expect(fourball).toBeChecked();

    // Avhuk én — submit-knapp forblir enabled (1 valgt ≥ 1).
    fireEvent.click(singles);
    expect(singles).not.toBeChecked();
    expect(screen.getByRole('button', { name: /opprett cup/i })).not.toBeDisabled();

    // Avhuk begge → submit disabled (validering: minst ett valg).
    fireEvent.click(fourball);
    expect(fourball).not.toBeChecked();
    expect(screen.getByRole('button', { name: /opprett cup/i })).toBeDisabled();
    expect(screen.getByText(/velg minst ett match-format/i)).toBeInTheDocument();
  });
});
