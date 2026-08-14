import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SideWinnersForm } from './SideWinnersForm';

/**
 * #1567: db_winners er en databaseskrivefeil, ikke en valideringsfeil — men
 * skjemaet viste «fyll ut feltene»-meldingen for alle koder. Én render-test
 * (Type C) som låser melding-rutingen: missing_-prefiks → validering, alt
 * annet → retry-rådet for db-feil.
 */

const baseProps = {
  gameId: 'G1',
  ldCount: 1,
  ctpCount: 0,
  players: [{ user_id: 'P1', display_name: 'Spiller 1' }],
  action: () => {},
};

describe('SideWinnersForm (#1567)', () => {
  it('viser db-melding for db_winners og valideringsmelding for missing_-koder', () => {
    const { rerender } = render(
      <SideWinnersForm {...baseProps} error="db_winners" />,
    );
    expect(
      screen.getByText('Klarte ikke å lagre vinnerne. Prøv igjen.'),
    ).toBeInTheDocument();

    rerender(<SideWinnersForm {...baseProps} error="missing_ld_1" />);
    expect(
      screen.getByText('Du må velge vinner i alle feltene før du kan avslutte.'),
    ).toBeInTheDocument();
  });
});
