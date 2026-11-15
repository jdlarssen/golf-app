import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SideWinnersForm } from './SideWinnersForm';
import type { SideSlotView } from '@/lib/games/finishSideSlots';

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

  it('viser egen melding når databasen nektet en trukket vinner (#2284)', () => {
    render(<SideWinnersForm {...baseProps} error="winner_withdrawn" />);
    expect(
      screen.getByTestId('side-winners-error-winner-withdrawn'),
    ).toHaveTextContent(
      'En av vinnerne du valgte har trukket seg. Ingenting ble lagret, og spillet er ikke avsluttet. Velg på nytt fra lista.',
    );
    expect(screen.queryByTestId('side-winners-error-db')).toBeNull();
  });
});

/**
 * #2283 (drawing V2): the slot label carries the hole, and under the select a
 * box «Meldt inn fra flightene» says what each flight reported. Nothing is
 * preselected: the organiser still picks the winner. Type B: the rendered form.
 */
describe('SideWinnersForm: det flightene har meldt inn (#2283)', () => {
  const players = [
    { user_id: 'jonas', display_name: 'Jonas Berg' },
    { user_id: 'marte', display_name: 'Marte Lie' },
  ];
  const props = { gameId: 'G1', ldCount: 1, ctpCount: 2, players, action: () => {} };
  const ld: SideSlotView = {
    hole: 9,
    reports: {
      hole: 9,
      lines: [{ flightNumber: 1, name: 'Jonas', distanceM: null }],
      missingFlights: [2],
    },
  };
  const ctp1: SideSlotView = {
    hole: 7,
    reports: {
      hole: 7,
      lines: [
        { flightNumber: 2, name: 'Kristian', distanceM: 1.8 },
        { flightNumber: 1, name: 'Marte', distanceM: 2.4 },
      ],
      missingFlights: [],
    },
  };
  const noHole: SideSlotView = { hole: null, reports: null };

  it('the label carries the hole, and a slot without one keeps today\'s label', () => {
    render(<SideWinnersForm {...props} ldSlots={[ld]} ctpSlots={[ctp1, noHole]} />);
    expect(screen.getByText('Lengste drive #1 · hull 9')).toBeInTheDocument();
    expect(screen.getByText('Nærmest pinnen #1 · hull 7')).toBeInTheDocument();
    expect(screen.getByText('Nærmest pinnen #2')).toBeInTheDocument();
  });

  it('draws the V2 phone: a box per slot with a hole, shortest distance first, then who is missing', () => {
    render(<SideWinnersForm {...props} ldSlots={[ld]} ctpSlots={[ctp1, noHole]} />);

    const ldBox = screen.getByTestId('side-reports-ld-1');
    expect(within(ldBox).getByText('Meldt inn fra flightene')).toBeInTheDocument();
    const ldRows = within(ldBox).getAllByRole('listitem');
    expect(ldRows.map((r) => r.textContent)).toEqual(['Flight 1Jonas', 'Flight 2 har ikke meldt inn']);

    const ctpBox = screen.getByTestId('side-reports-ctp-1');
    const ctpRows = within(ctpBox).getAllByRole('listitem');
    expect(ctpRows.map((r) => r.textContent)).toEqual(['Flight 2Kristian1,8 m', 'Flight 1Marte2,4 m']);
    // The distance is a tabular number on the right; the name takes the room between.
    const distance = within(ctpRows[0]).getByText('1,8 m');
    expect(distance).toHaveClass('tabular-nums', 'shrink-0');
    expect(within(ctpRows[0]).getByText('Kristian')).toHaveClass('flex-1', 'font-semibold');
    // The box of the slot without a hole is not there: two boxes, not three.
    expect(screen.getAllByRole('group', { name: 'Meldt inn fra flightene' })).toHaveLength(2);
    expect(screen.queryByTestId('side-reports-ctp-2')).toBeNull();
  });

  it('the box is the drawing\'s: 12 px radius, surface fill, 12/600 muted heading, dividers between lines', () => {
    render(<SideWinnersForm {...props} ldSlots={[ld]} ctpSlots={[ctp1, noHole]} />);
    const box = screen.getByTestId('side-reports-ctp-1');
    expect(box).toHaveClass('rounded-xl', 'bg-surface', 'px-3', 'pt-2.5', 'pb-1', 'mt-2');
    expect(within(box).getByText('Meldt inn fra flightene')).toHaveClass('text-xs', 'font-semibold', 'text-muted');
    const rows = within(box).getAllByRole('listitem');
    expect(rows[0]).not.toHaveClass('border-t');
    expect(rows[1]).toHaveClass('border-t', 'border-row-divider-warm');
    expect(within(rows[0]).getByText('Flight 2')).toHaveClass('w-16', 'text-muted');
  });

  it('«Flighten» in a single-flight game, and «Ingen på green» / «Ingen på fairway» as the answer', () => {
    render(
      <SideWinnersForm
        {...props}
        ldSlots={[{ hole: 9, reports: { hole: 9, lines: [{ flightNumber: 0, name: null, distanceM: null }], missingFlights: [] } }]}
        ctpSlots={[
          { hole: 7, reports: { hole: 7, lines: [{ flightNumber: 0, name: null, distanceM: null }], missingFlights: [] } },
          noHole,
        ]}
      />,
    );
    expect(within(screen.getByTestId('side-reports-ld-1')).getAllByRole('listitem')[0].textContent).toBe('FlightenIngen på fairway');
    expect(within(screen.getByTestId('side-reports-ctp-1')).getAllByRole('listitem')[0].textContent).toBe('FlightenIngen på green');
  });

  it('with no report at all the box says so, and does not list the missing flights', () => {
    render(
      <SideWinnersForm
        {...props}
        ctpCount={1}
        ldCount={0}
        ctpSlots={[{ hole: 7, reports: { hole: 7, lines: [], missingFlights: [1, 2] } }]}
      />,
    );
    const box = screen.getByTestId('side-reports-ctp-1');
    expect(within(box).getByText('Ingen flight har meldt inn på hull 7.')).toBeInTheDocument();
    expect(within(box).queryByRole('listitem')).toBeNull();
    expect(within(box).queryByText(/har ikke meldt inn$/)).toBeNull();
  });

  it('a failed read shows the app\'s line in the box, and the form still works', () => {
    render(
      <SideWinnersForm
        {...props}
        ldSlots={[{ hole: 9, reports: 'failed' }]}
        ctpSlots={[{ hole: 7, reports: 'failed' }, noHole]}
      />,
    );
    expect(screen.getAllByText('Fikk ikke hentet det flightene har meldt inn.')).toHaveLength(2);
    // The label still carries the hole, and the choice is made as ever.
    expect(screen.getByText('Lengste drive #1 · hull 9')).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: /Lengste drive #1/ });
    fireEvent.change(select, { target: { value: 'marte' } });
    expect((select as HTMLSelectElement).value).toBe('marte');
    expect(screen.getByRole('button', { name: 'Avslutt spillet og publiser sideturneringen' })).toBeEnabled();
  });

  it('a slot without a hole renders as before: no box, today\'s label, nothing extra', () => {
    const { container, rerender } = render(<SideWinnersForm {...props} />);
    expect(screen.queryByText('Meldt inn fra flightene')).toBeNull();
    expect(screen.getByText('Lengste drive #1')).toBeInTheDocument();
    const before = container.innerHTML;
    // Slots that say «no hole» give the same page as no slot props at all.
    rerender(<SideWinnersForm {...props} ldSlots={[noHole]} ctpSlots={[noHole, noHole]} />);
    expect(container.innerHTML).toBe(before);
  });

  it('nothing is preselected: every select stays on the empty choice', () => {
    render(<SideWinnersForm {...props} ldSlots={[ld]} ctpSlots={[ctp1, noHole]} />);
    for (const name of ['ld_winner_1', 'ctp_winner_1', 'ctp_winner_2']) {
      const select = document.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
      expect(select.value).toBe('');
      expect(select).toBeRequired();
    }
  });
});
