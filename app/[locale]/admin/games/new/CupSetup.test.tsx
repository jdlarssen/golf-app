import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CupSetup } from './CupSetup';

// Type C render-tester per docs/test-discipline.md — verifiserer DOM-strukturen
// CupSetup rendrer: cup-navn, lag-navn og poeng-vekter. Form action submits via
// createTournamentDraft (server-action) — vi sjekker DOM-struktur, ikke submit-flyt.
//
// #1142: poengmål-feltet og de fem allowance-feltene er fjernet. Poengmålet
// utledes ved cup-start fra det reelle match-antallet.
//
// #1472: format-multiselecten er fjernet fra opprettelsen — bane, tee og format
// velges nå i Oppsett-rommet etter at cupen er opprettet. Opprettelsesformen er
// ren: navn + lag-navn + poeng-vekter + opprett-knapp.

// #1397: createTournamentDraft returnerer nå et action-resultat ({ error })
// i stedet for å redirecte, og CupSetup konsumerer det via useActionState. Mock-en
// gir en representativ feilkode så banner-testen under kan verifisere at meldingen
// rendres; selve retur-i-stedet-for-redirect-regresjonen er unit-testet i
// lib/cup/actions.test.ts.
vi.mock('@/lib/cup/actions', () => ({
  createTournamentDraft: vi.fn(async () => ({ error: 'cup_team_dup' })),
}));

describe('CupSetup', () => {
  it('viser cup-navn + lag-navn uten format-multiselect', () => {
    render(<CupSetup />);

    expect(screen.getByLabelText(/cup-navn/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^lag 1$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^lag 2$/i)).toBeInTheDocument();
    // #1142: poengmål spørres ikke lenger om ved opprettelse.
    expect(screen.queryByLabelText(/poengmål/i)).not.toBeInTheDocument();

    // #1472: format-multiselecten er borte — ingen `cup_format_*`-checkboxer.
    expect(
      document.querySelector('input[id^="cup_format_"]'),
    ).not.toBeInTheDocument();

    // Submit-knappen er alltid enabled — ingen format-gate blokkerer opprettelse.
    expect(
      screen.getByRole('button', { name: /opprett cup/i }),
    ).not.toBeDisabled();
  });

  // #1397: en feilkode fra server-action-en rendres som feilbanner over knappen
  // (via useActionState) i stedet for en redirect som slettet det utfylte
  // skjemaet. Mirror av CreateLigaForm.test.tsx sin season_over-banner-test.
  it('rendrer feilbanner når action-en returnerer en feilkode', async () => {
    const { container } = render(<CupSetup />);

    // Submit trigger-er useActionState → mock returnerer { error: 'cup_team_dup' }.
    fireEvent.submit(container.querySelector('form')!);

    expect(
      await screen.findByText('Lagene må ha forskjellige navn.'),
    ).toBeInTheDocument();
    // Ikke rå-kode-fallbacken (beviser at koden er mappet i cup.create.errors).
    expect(screen.queryByText(/Uventet feil:/)).not.toBeInTheDocument();
  });
});
