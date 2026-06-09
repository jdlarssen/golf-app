import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenerateMatchesWizard } from './GenerateMatchesWizard';
import type { WizardPlayer, WizardCourse } from './GenerateMatches';

// Type C render-tester per docs/test-discipline.md — verifiserer at steg 1
// (Lag-roster) viser team-navn og spillere, og at #526/#530-cap-gaten på steg 3
// (cap-varsel + «Neste» disabled) wires opp fra matchCap-propen. Pairing- og
// match-count-logikken er dekket av lib/cup/cupPairing.test og cupTemplates.test;
// cap-logikken av lib/cup/limits.test.

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

  it('blokkerer «Neste» og viser cap-varsel når personlig-cup-taket overskrides', () => {
    // 6 spillere, 3 per lag → klassisk-preset (default) gir 5 matcher
    // (1 foursomes + 1 four-ball + 3 singler), over personlig-cup-taket på 4.
    const sixPlayers: WizardPlayer[] = [
      ...PLAYERS,
      { id: 'p5', displayName: 'Per Nilsen', hcpIndex: 15.0 },
      { id: 'p6', displayName: 'Mette Lie', hcpIndex: 20.0 },
    ];

    render(
      <GenerateMatchesWizard
        tournamentId="t-1"
        team1Name="Ørnen"
        team2Name="Falken"
        players={sixPlayers}
        courses={COURSES}
        matchCap={4}
      />,
    );

    // Steg 1: fordel 3 spillere på Ørnen, 3 på Falken (én toggle-knapp per rad,
    // i spiller-rekkefølge).
    const toTeam1 = screen.getAllByRole('button', { name: 'Ørnen' });
    fireEvent.click(toTeam1[0]);
    fireEvent.click(toTeam1[1]);
    fireEvent.click(toTeam1[2]);
    const toTeam2 = screen.getAllByRole('button', { name: 'Falken' });
    fireEvent.click(toTeam2[3]);
    fireEvent.click(toTeam2[4]);
    fireEvent.click(toTeam2[5]);

    // Steg 2: velg bane → tee-feltet dukker opp → velg tee.
    fireEvent.click(screen.getByRole('button', { name: /neste/i }));
    fireEvent.change(screen.getByLabelText(/velg bane/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/velg tee/i), {
      target: { value: 'tee-1' },
    });

    // Steg 3: oppsettet (5 matcher) overstiger taket på 4 → varsel + låst «Neste».
    fireEvent.click(screen.getByRole('button', { name: /neste/i }));
    expect(screen.getByText(/steg 3 av 5/i)).toBeInTheDocument();
    expect(screen.getByText(/oppsettet gir 5 matcher/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /neste/i })).toBeDisabled();
  });
});
