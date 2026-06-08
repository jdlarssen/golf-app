import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GenerateMatchesWizard } from './GenerateMatchesWizard';
import type { WizardPlayer, WizardCourse } from './GenerateMatches';

// Én Type C render-test per docs/test-discipline.md — verifiserer at
// steg 1 (Lag-roster) viser team-navn og spillere. Pairing-logikken
// er dekket av lib/cup/cupPairing.test og lib/cup/cupTemplates.test.

vi.mock('./actions', () => ({
  createCupMatchesFromPlan: vi.fn(async () => ({ error: 'insert_failed' })),
}));

const PLAYERS: WizardPlayer[] = [
  { id: 'p1', displayName: 'Kari Nordmann', hcpIndex: 12.0 },
  { id: 'p2', displayName: 'Ola Hansen', hcpIndex: 18.0 },
  { id: 'p3', displayName: 'Lars Berg', hcpIndex: 8.5 },
  { id: 'p4', displayName: 'Ida Dahl', hcpIndex: 24.0 },
];

const COURSES: WizardCourse[] = [
  {
    id: 'course-1',
    name: 'Stiklestad GK',
    teeBoxes: [{ id: 'tee-1', name: 'Gul' }],
  },
];

describe('GenerateMatchesWizard', () => {
  it('rendrer steg 1 med lag-navn og alle spillere listet', () => {
    render(
      <GenerateMatchesWizard
        tournamentId="t-1"
        team1Name="Ørnen"
        team2Name="Falken"
        players={PLAYERS}
        courses={COURSES}
      />,
    );

    // Step indicator
    expect(screen.getByText(/steg 1 av 5/i)).toBeInTheDocument();

    // Both team names should appear in the roster toggle labels
    const teamLabels = screen.getAllByText('Ørnen');
    expect(teamLabels.length).toBeGreaterThan(0);
    const team2Labels = screen.getAllByText('Falken');
    expect(team2Labels.length).toBeGreaterThan(0);

    // All 4 players listed
    expect(screen.getByText('Kari Nordmann')).toBeInTheDocument();
    expect(screen.getByText('Ola Hansen')).toBeInTheDocument();
    expect(screen.getByText('Lars Berg')).toBeInTheDocument();
    expect(screen.getByText('Ida Dahl')).toBeInTheDocument();

    // Navigation buttons present
    expect(screen.getByRole('button', { name: /forrige/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /neste/i })).toBeInTheDocument();
  });
});
