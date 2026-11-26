// #2980: your number in the league page's round list (Type B). Which rounds
// have a number is `myRoundCell`'s job (lib/league/standingsFormat.test.ts);
// here: what the row shows and where it links.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RoundMyResult } from './RoundMyResult';

beforeEach(() => cleanup());

type Props = Parameters<typeof RoundMyResult>[0];

function renderRow(overrides: Partial<Props> = {}) {
  const props: Props = {
    mine: { raw: 34, gameId: 'g1' },
    awaiting: false,
    model: 'best_n',
    pointsBased: true,
    leagueId: 'l1',
    userId: 'me',
    roundLabel: 'Runde 1',
    action: <span data-testid="today-action">Levert</span>,
    children: <p>Runde 1</p>,
    ...overrides,
  };
  return render(<RoundMyResult {...props} />);
}

describe('RoundMyResult — your number in the round list (#2980)', () => {
  it('a played round shows your points and the whole row opens your card', () => {
    renderRow();
    const link = screen.getByTestId('liga-round-card-link');
    expect(link).toHaveAttribute('href', '/liga/l1/kort/g1/me');
    expect(link).toHaveAttribute('aria-label', 'Se kortet ditt fra Runde 1, 34 poeng');
    // The round's own column is inside the link: the row is the target.
    expect(link).toHaveTextContent(/^Runde 1/);
    expect(screen.getByTestId('liga-round-my-result')).toHaveTextContent('34poeng');
    // The number takes «Levert»'s place.
    expect(screen.queryByTestId('today-action')).toBeNull();
  });

  it('the number is tabular, and the target at least 44 px high', () => {
    renderRow();
    expect(screen.getByText('34')).toHaveClass('tabular-nums');
    expect(screen.getByTestId('liga-round-card-link')).toHaveClass('min-h-[44px]');
  });

  it('stroke play shows strokes to par alone, as the table cell does', () => {
    renderRow({ mine: { raw: 3, gameId: 'g1' }, model: 'total', pointsBased: false });
    expect(screen.getByTestId('liga-round-my-result')).toHaveTextContent(/^\+3$/);
    expect(screen.getByTestId('liga-round-card-link')).toHaveAttribute('aria-label', 'Se kortet ditt fra Runde 1, +3');
  });

  it('a round without your number (not played, a penalty, upcoming) keeps today\'s row', () => {
    renderRow({ mine: null, action: <span data-testid="today-action">Åpner 1. des. 2026</span> });
    expect(screen.getByTestId('today-action')).toBeInTheDocument();
    expect(screen.queryByTestId('liga-round-my-result')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('a card that waits for the marker keeps the waiting line, with no number', () => {
    renderRow({ awaiting: true, action: <span data-testid="liga-round-awaiting-marker">Venter på godkjenning fra Martin</span> });
    expect(screen.getByTestId('liga-round-awaiting-marker')).toBeInTheDocument();
    expect(screen.queryByTestId('liga-round-my-result')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('without the card gate\'s yes, or without a flight, the number is plain text', () => {
    renderRow({ leagueId: null });
    expect(screen.getByTestId('liga-round-my-result')).toHaveTextContent('34poeng');
    expect(screen.queryByRole('link')).toBeNull();
    cleanup();
    renderRow({ mine: { raw: 34, gameId: null } });
    expect(screen.getByTestId('liga-round-my-result')).toHaveTextContent('34poeng');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
