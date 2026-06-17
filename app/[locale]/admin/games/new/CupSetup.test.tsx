import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CupSetup } from './CupSetup';
import type { CupEligibleFormat } from '@/lib/formats/getFormatsForIntent';

// Type C render-tester per docs/test-discipline.md — verifiserer DOM-strukturen
// CupSetup rendrer: lag-navn-felt, points-to-win, og multi-select for de
// passerte cup-eligible formats (default-grenen), pluss den capped personlige
// cup-grenen (#526/#530: matchCap → lavere point-mål-default). Cap-logikken selv
// er Type A i lib/cup/limits.test. Form action submits via createTournamentDraft
// (server-action) — vi sjekker DOM-struktur, ikke submit-flyt.
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
  it('viser lag-navn + points + multi-select med default-all valgt', () => {
    render(<CupSetup cupEligibleFormats={CUP_ELIGIBLE} />);

    expect(screen.getByLabelText(/cup-navn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^lag 1$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^lag 2$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/poengmål/i)).toBeInTheDocument();

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

  it('senker point-mål-default til 2,5 og forklarer taket for en capped personlig cup', () => {
    render(<CupSetup cupEligibleFormats={CUP_ELIGIBLE} matchCap={4} />);

    // Point-mål-default følger taket: 4 / 2 + 0,5 = 2,5 (mot admin/klubb-cupens 4,5).
    expect((screen.getByLabelText(/poengmål/i) as HTMLInputElement).value).toBe('2,5');
    // Hinten forklarer regelen mot det personlige taket på 4 matcher.
    expect(screen.getByText(/med 4 matcher blir det 2,5/i)).toBeInTheDocument();
  });
});
