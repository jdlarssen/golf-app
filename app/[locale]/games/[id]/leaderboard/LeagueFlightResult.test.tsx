/**
 * Type-B render test (#2712, #2850, owner 12.11): a league flight has no place
 * and no win, so the finished board shows every player's points and «Godkjent»,
 * with no duel, podium, place number, medallion or confetti.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeagueFlightResult } from './LeagueFlightResult';

const siri = { userId: 'user-siri', name: 'Siri Solo', scoreText: '29', scoreLabel: 'poeng' };
const ola = { userId: 'user-ola', name: 'Ola Birdie', scoreText: '33', scoreLabel: 'poeng' };
const kari = { userId: 'user-kari', name: 'Kari Par', scoreText: '21', scoreLabel: 'poeng' };

function renderFlight(rows: (typeof siri)[]) {
  return render(
    <LeagueFlightResult
      gameName="Vinterligaen · runde 1"
      rows={rows}
      subtitle="Etter 18 hull"
    />,
  );
}

describe('LeagueFlightResult (#2712, #2850)', () => {
  it('one player: the name, the points and «Godkjent»', () => {
    renderFlight([siri]);
    const list = screen.getByTestId('league-flight-result');
    expect(list.textContent).toContain('Siri Solo');
    expect(list.textContent).toContain('29');
    expect(list.textContent).toContain('poeng');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Godkjent');
  });

  it('two or more players: one row each in the given order, still «Godkjent»', () => {
    renderFlight([ola, siri, kari]);
    const rows = screen.getAllByTestId('league-flight-row');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Ola Birdie'),
      expect.stringContaining('Siri Solo'),
      expect.stringContaining('Kari Par'),
    ]);
    expect(rows[0].textContent).toContain('33');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Godkjent');
  });

  it('has no podium, medallion, place number, winner or congratulations', () => {
    const { container } = renderFlight([ola, siri]);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('[data-testid^="podium-rank-"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Vinneren er kåret|Gratulerer|vant|plass|1\.|2\./);
  });
});
