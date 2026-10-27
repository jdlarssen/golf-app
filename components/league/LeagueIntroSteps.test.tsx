import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LeagueIntroSteps } from './LeagueIntroSteps';

beforeEach(() => cleanup());

/**
 * Type B (#2662): the intro is copy the player reads, so the steps are locked
 * as text. The simulator league has its own step 2 (marker in the league), an
 * ordinary league has a playing partner who approves.
 */
function steps() {
  return screen.getAllByRole('listitem').map((li) => li.textContent);
}

describe('LeagueIntroSteps', () => {
  it('a simulator league: the marker is someone in the league', () => {
    render(<LeagueIntroSteps isSimulator />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Slik funker ligaen i Tørny');
    expect(steps()).toMatchInlineSnapshot(`
      [
        "Når runden åpner, starter du den fra ligasiden og fører slagene hull for hull.",
        "Når du er ferdig, sender du inn kortet og velger en i ligaen som markør. Runden teller når markøren har godkjent.",
        "Tabellen ligger på ligasiden og oppdateres etter hver godkjente runde.",
      ]
    `);
  });

  it('an ordinary league: a playing partner approves, no marker step', () => {
    render(<LeagueIntroSteps isSimulator={false} />);
    expect(steps()[1]).toMatchInlineSnapshot(
      `"Når runden er ferdig, sender du inn kortet, og en medspiller godkjenner det."`,
    );
  });
});
