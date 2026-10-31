/**
 * Type-B render test (#2712, orchestrator 31.10 after the owner's rule): a
 * league round played alone has no place and no win, so the finished board
 * shows the points and «Godkjent», with no podium, medallion or confetti.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeagueAloneResult } from './LeagueAloneResult';

function renderAlone() {
  return render(
    <LeagueAloneResult
      gameName="Vinterligaen · runde 1"
      userId="user-siri"
      name="Siri Solo"
      scoreText="29"
      scoreLabel="poeng"
      subtitle="Etter 18 hull"
    />,
  );
}

describe('LeagueAloneResult (#2712)', () => {
  it('shows the name, the points and «Godkjent»', () => {
    renderAlone();
    const card = screen.getByTestId('league-alone-result');
    expect(card.textContent).toContain('Siri Solo');
    expect(card.textContent).toContain('29');
    expect(card.textContent).toContain('poeng');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Godkjent');
  });

  it('has no podium, medallion, confetti or congratulations', () => {
    const { container } = renderAlone();
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('[data-testid^="podium-rank-"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Vinneren er kåret|Gratulerer|vant/);
  });
});
