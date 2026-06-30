import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SeasonRecapPanel } from './SeasonRecapPanel';
import type { SeasonSummary } from '@/lib/stats/seasonStats';

// Type C — én render-test for sesong-recap-en (#946). Verifiserer struktur +
// interaksjon (default = nyeste år, år-bytte, delta-kontekst), IKKE
// aggregerings-tallene (de dekkes av seasonStats Type A). Labels resolves fra
// messages/no.json via vitest.setup-mocken.

const season = (
  year: number,
  achievements: SeasonSummary['achievements'],
): SeasonSummary => ({
  year,
  rounds: 10,
  grossAverage: 82,
  bestRound: 74,
  achievements,
});

describe('SeasonRecapPanel', () => {
  it('defaults to the newest year and switches year', () => {
    const seasons: SeasonSummary[] = [
      season(2026, {
        holeInOne: 0,
        eagle: 1,
        birdie: 5,
        turkey: 1, // 2026-only — disappears after switching year
        snowman: 2,
      }),
      season(2025, {
        holeInOne: 0,
        eagle: 0,
        birdie: 3,
        turkey: 0,
        snowman: 0,
      }),
    ];

    render(<SeasonRecapPanel seasons={seasons} />);

    // Default: newest year (2026) selected.
    expect(screen.getByRole('tab', { name: '2026' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: '2025' })).toBeInTheDocument();

    // Brag stripe shows the positive brags (turkey present for 2026)...
    expect(screen.getByText('Turkey')).toBeInTheDocument();
    expect(screen.getByText('Birdie')).toBeInTheDocument();
    // ...and snowman is surfaced nowhere (negatively charged, not a brag).
    expect(screen.queryByText('Snowman')).not.toBeInTheDocument();
    expect(screen.queryByText(/snømenn/)).not.toBeInTheDocument();

    // Delta context vs the previous year present.
    expect(screen.getByText('Sammenlignet med 2025')).toBeInTheDocument();

    // Switch to 2025: turkey gone, and no previous-year context (2024 absent)
    // so the delta caption disappears too.
    fireEvent.click(screen.getByRole('tab', { name: '2025' }));
    expect(screen.getByRole('tab', { name: '2025' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.queryByText('Turkey')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Sammenlignet med/)).not.toBeInTheDocument();
  });
});
