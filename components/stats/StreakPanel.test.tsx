import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreakPanel } from './StreakPanel';
import type { StreakSummary } from '@/lib/stats/streak';

// Type C — én render-test for streak-seksjonen (#1194). Verifiserer de to
// tilstandene (pågående streak vs. hvilende) + at ingen tap-/skam-copy finnes,
// IKKE aggregerings-tallene (de eies av streak Type A). Strengene sendes inn
// som props.

const summary = (partial: Partial<StreakSummary>): StreakSummary => ({
  weeklyStreak: 0,
  weeklyStreakActive: false,
  roundsThisSeason: 0,
  roundsInStreak: 0,
  lastRoundWeekKey: null,
  ...partial,
});

describe('StreakPanel', () => {
  it('shows the fire-lit streak when active (≥2 weeks) and the season line', () => {
    render(
      <StreakPanel
        summary={summary({
          weeklyStreak: 3,
          weeklyStreakActive: true,
          roundsThisSeason: 12,
          roundsInStreak: 4,
        })}
        heading="Serie"
        subtitle="Hold det gående"
        weeksLabel="uker på rad"
        dormantLine="Serien starter neste gang du spiller."
        seasonText="12 runder i 2026"
      />,
    );

    expect(screen.getByTestId('streak-active')).toBeInTheDocument();
    expect(screen.queryByTestId('streak-dormant')).not.toBeInTheDocument();
    expect(screen.getByText('uker på rad')).toBeInTheDocument();
    expect(screen.getByText('12 runder i 2026')).toBeInTheDocument();
  });

  it('shows a calm, pressure-free line when no streak is running', () => {
    render(
      <StreakPanel
        summary={summary({ roundsThisSeason: 5 })}
        heading="Serie"
        subtitle="Hold det gående"
        weeksLabel="uker på rad"
        dormantLine="Serien starter neste gang du spiller."
        seasonText="5 runder i 2026"
      />,
    );

    expect(screen.getByTestId('streak-dormant')).toBeInTheDocument();
    expect(screen.queryByTestId('streak-active')).not.toBeInTheDocument();
    // Guardrail: no loss/countdown/shame framing anywhere in the rendered copy.
    expect(document.body.textContent).not.toMatch(/mister|tap|brutt|ikke bryt/i);
  });

  it('does not celebrate a single week (below the streak threshold)', () => {
    render(
      <StreakPanel
        summary={summary({
          weeklyStreak: 1,
          weeklyStreakActive: true,
          roundsThisSeason: 1,
          roundsInStreak: 1,
        })}
        heading="Serie"
        subtitle="Hold det gående"
        weeksLabel="uker på rad"
        dormantLine="Serien starter neste gang du spiller."
        seasonText="1 runde i 2026"
      />,
    );

    expect(screen.getByTestId('streak-dormant')).toBeInTheDocument();
    expect(screen.queryByTestId('streak-active')).not.toBeInTheDocument();
  });
});
