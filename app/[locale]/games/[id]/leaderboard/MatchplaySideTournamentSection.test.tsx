import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  MatchplaySideTournamentSection,
  type MatchplaySideTournamentSectionProps,
} from './MatchplaySideTournamentSection';
import type { SideTournamentTeam } from './SideTournamentView';
import type { SideTournamentResult } from '@/lib/scoring/sideTournament';

// To duell-sider som lag 1/2 (#585) — singles-tilfellet: ett medlem per side.
function makeTeams(): SideTournamentTeam[] {
  return [
    {
      teamId: 1,
      label: 'Lag 1',
      members: [
        { userId: 'u1', displayName: 'Alice Andersen', firstName: 'Alice' },
      ],
    },
    {
      teamId: 2,
      label: 'Lag 2',
      members: [{ userId: 'u2', displayName: 'Bjørn Berg', firstName: 'Bjørn' }],
    },
  ];
}

function makeResult(): SideTournamentResult {
  return {
    teamStandings: [
      { teamId: 1, totalPoints: 2, awards: [] },
      { teamId: 2, totalPoints: 2, awards: [] },
    ],
  };
}

function defaultProps(
  overrides: Partial<MatchplaySideTournamentSectionProps> = {},
): MatchplaySideTournamentSectionProps {
  return {
    teams: makeTeams(),
    result: makeResult(),
    ldCount: 1,
    ctpCount: 1,
    sideWinners: [
      { category: 'longest_drive', position: 1, winnerUserId: 'u1' },
      { category: 'closest_to_pin', position: 1, winnerUserId: 'u2' },
    ],
    coursePars: Array.from({ length: 18 }, () => 4),
    disabledCategories: [],
    ...overrides,
  };
}

describe('MatchplaySideTournamentSection', () => {
  it('viser minimal LD/CTP-headline og utvider til hele poenggrunnlaget', () => {
    render(<MatchplaySideTournamentSection {...defaultProps()} />);

    const section = screen.getByTestId('matchplay-side-tournament');
    expect(section).toBeInTheDocument();

    // Minimal headline — admin-kårede LD/CTP-vinnere med fornavn, alltid synlig.
    expect(section.textContent).toMatch(/Lengste drive #1: Alice/);
    expect(section.textContent).toMatch(/Nærmest pinnen #1: Bjørn/);

    // Poenggrunnlaget ligger bak en native <details>-disclosure.
    const summary = screen.getByText('Vis poenggrunnlaget');
    expect(summary.closest('details')).not.toBeNull();

    // Ekspandert innhold = SideTournamentView. Singles-sidene er lag-av-1, så
    // radene viser spillernavnet (displayName) i stedet for «Lag N» (#604).
    expect(section.textContent).toMatch(/Slik gis poengene/);
    expect(section.textContent).toMatch(/Alice Andersen/);
    expect(section.textContent).toMatch(/Bjørn Berg/);
  });
});
