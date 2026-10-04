import { it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PultTabs } from './PultTabs';

/**
 * #2268, Type C: the desk's tabs follow the tablist pattern (one tab stop,
 * the arrow keys switch tab) and keep every panel mounted, hiding the
 * inactive ones.
 */
it('is a tablist with one tab stop, arrow keys and hidden inactive panels', () => {
  render(
    <PultTabs
      initialTab="players"
      live={<p data-testid="live-content" />}
      players={<p data-testid="players-content" />}
      setup={<p data-testid="setup-content" />}
    />,
  );

  expect(screen.getByRole('tablist')).toBeInTheDocument();
  const [live, players, setup] = screen.getAllByRole('tab');
  expect(players).toHaveAttribute('aria-selected', 'true');
  expect(live).toHaveAttribute('aria-selected', 'false');
  expect(players).toHaveAttribute('tabindex', '0');
  expect(live).toHaveAttribute('tabindex', '-1');
  expect(setup).toHaveAttribute('tabindex', '-1');

  // Every panel is mounted; only the selected one is visible.
  const panels = screen.getAllByRole('tabpanel', { hidden: true });
  expect(panels).toHaveLength(3);
  for (const tab of [live, players, setup]) {
    const panel = document.getElementById(tab.getAttribute('aria-controls')!);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  }
  expect(screen.getByTestId('live-content')).not.toBeVisible();
  expect(screen.getByTestId('players-content')).toBeVisible();
  expect(screen.getByTestId('setup-content')).not.toBeVisible();

  fireEvent.keyDown(players, { key: 'ArrowRight' });
  expect(setup).toHaveAttribute('aria-selected', 'true');
  expect(setup).toHaveFocus();
  expect(screen.getByTestId('setup-content')).toBeVisible();
  expect(screen.getByTestId('players-content')).not.toBeVisible();

  fireEvent.keyDown(setup, { key: 'ArrowRight' });
  expect(live).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByTestId('live-content')).toBeVisible();
});
