import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CupSetup } from './CupSetup';
import type { CupEligibleFormat } from '@/lib/formats/getFormatsForIntent';

// Type C render-tester per docs/test-discipline.md — verifiserer DOM-strukturen
// CupSetup rendrer: lag-navn-felt og multi-select for de passerte cup-eligible
// formats. Form action submits via createTournamentDraft (server-action) — vi
// sjekker DOM-struktur, ikke submit-flyt.
//
// #1142: poengmål-feltet og de fem allowance-feltene er fjernet. Poengmålet
// utledes ved cup-start fra det reelle match-antallet, og allowance-feltene
// skrev bare WHS-defaultene serveren uansett bruker.
//
// #689: format-valget (checkboxene) er ikke persistert og har ingen
// runtime-effekt — den tidligere disabled-sperra er fjernet. Submit-knappen
// er alltid enabled uavhengig av antall avhukede formater.

// Mock createTournamentDraft — vi binder action-en kun for type-safety,
// tester aldri faktisk submit her (det testes i lib/cup/actions.test).
vi.mock('@/lib/cup/actions', () => ({
  createTournamentDraft: vi.fn(async () => {}),
}));

const CUP_ELIGIBLE: CupEligibleFormat[] = [
  { slug: 'singles_matchplay', icon_key: 'singles_matchplay' },
  { slug: 'fourball_matchplay', icon_key: 'fourball_matchplay' },
];

describe('CupSetup', () => {
  it('viser lag-navn + multi-select med default-all valgt', () => {
    render(<CupSetup cupEligibleFormats={CUP_ELIGIBLE} />);

    expect(screen.getByLabelText(/cup-navn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^lag 1$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^lag 2$/i)).toBeInTheDocument();
    // #1142: poengmål spørres ikke lenger om ved opprettelse.
    expect(screen.queryByLabelText(/poengmål/i)).not.toBeInTheDocument();

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

    // #689: submit-knapp er alltid enabled — format-valget er ikke persistert
    // og blokkerer derfor ikke opprettelse, uansett antall avhukede formater.
    expect(screen.getByRole('button', { name: /opprett cup/i })).not.toBeDisabled();

    // Avhuk alle → knapp forblir enabled (ingen dead gate).
    fireEvent.click(singles);
    fireEvent.click(fourball);
    expect(singles).not.toBeChecked();
    expect(fourball).not.toBeChecked();
    expect(screen.getByRole('button', { name: /opprett cup/i })).not.toBeDisabled();
  });
});
