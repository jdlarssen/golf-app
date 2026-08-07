import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenerateMatchesWizard } from './GenerateMatchesWizard';
import type { WizardPlayer, WizardTeeBox } from './GenerateMatches';

// Type C render-tester per docs/test-discipline.md — verifiserer at #1472s
// to-stegs veiviser (steg 1 = lag-roster over deltakerne, steg 2 = preview +
// generer) viser team-navn/spillere, at #526-cap-gaten wires opp fra
// matchCap-propen, og at splittet-cup-dag-bunten rendrer med lag-slag-felt og
// matchup-rader. Bane/tee/format kommer nå som props (fra den lagrede planen),
// ikke wizard-steg. Pairing-/match-count-logikk er dekket av lib/cup/-suitene.

vi.mock('./actions', () => ({
  createCupMatchesFromPlan: vi.fn(async () => ({ error: 'insert_failed' })),
}));

const PLAYERS: WizardPlayer[] = [
  { id: 'p1', displayName: 'Kari Nordmann', hcpIndex: 12.0 },
  { id: 'p2', displayName: 'Ola Hansen', hcpIndex: 18.0 },
  { id: 'p3', displayName: 'Lars Berg', hcpIndex: 8.5 },
  { id: 'p4', displayName: 'Ida Dahl', hcpIndex: 24.0 },
];

// tee-1 uten ratingsett → greensomens regnehjelp faller tilbake til rå
// HCP-indeks (samme fixture-form som før #1472).
const TEE: WizardTeeBox = { id: 'tee-1', name: 'Gul' };

const BASE = {
  tournamentId: 't-1',
  team1Name: 'Ørnen',
  team2Name: 'Falken',
  planCourseName: 'Stiklestad GK',
  planTeeName: 'Gul',
  selectedTee: TEE,
  presetId: 'klassisk',
  customSessions: [],
  strategy: 'handicap' as const,
};

describe('GenerateMatchesWizard', () => {
  it('rendrer steg 1 med lag-navn og alle deltakere listet', () => {
    render(<GenerateMatchesWizard {...BASE} players={PLAYERS} />);

    // To steg nå (#1472).
    expect(screen.getByText(/steg 1 av 2/i)).toBeInTheDocument();

    // Begge lag-navn i roster-togglene.
    expect(screen.getAllByText('Ørnen').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Falken').length).toBeGreaterThan(0);

    // Alle 4 deltakere listet.
    expect(screen.getByText('Kari Nordmann')).toBeInTheDocument();
    expect(screen.getByText('Ola Hansen')).toBeInTheDocument();
    expect(screen.getByText('Lars Berg')).toBeInTheDocument();
    expect(screen.getByText('Ida Dahl')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: /forrige/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /neste/i })).toBeInTheDocument();
  });

  it('blokkerer «Neste» og viser cap-varsel på steg 1 når personlig-cup-taket overskrides', () => {
    // 6 deltakere, 3 per lag → klassisk-preset (fra planen) gir 5 matcher
    // (1 foursomes + 1 four-ball + 3 singler), over personlig-cup-taket på 4.
    // Format-gaten som lå på det gamle steg 3 er nå på steg 1 (#1472).
    const sixPlayers: WizardPlayer[] = [
      ...PLAYERS,
      { id: 'p5', displayName: 'Per Nilsen', hcpIndex: 15.0 },
      { id: 'p6', displayName: 'Mette Lie', hcpIndex: 20.0 },
    ];

    render(
      <GenerateMatchesWizard {...BASE} players={sixPlayers} matchCap={4} />,
    );

    const toTeam1 = screen.getAllByRole('button', { name: 'Ørnen' });
    fireEvent.click(toTeam1[0]);
    fireEvent.click(toTeam1[1]);
    fireEvent.click(toTeam1[2]);
    const toTeam2 = screen.getAllByRole('button', { name: 'Falken' });
    fireEvent.click(toTeam2[3]);
    fireEvent.click(toTeam2[4]);
    fireEvent.click(toTeam2[5]);

    // Cap-varsel + låst «Neste» rett på steg 1 — ingen mellomliggende steg.
    expect(screen.getByText(/steg 1 av 2/i)).toBeInTheDocument();
    expect(screen.getByText(/oppsettet gir 5 matcher/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /neste/i })).toBeDisabled();
  });

  it('splittet-cup-dag: roster→preview genererer flight-bunt med lag-slag-felt og matchup-rader (#1441, F3e)', () => {
    render(
      <GenerateMatchesWizard
        {...BASE}
        players={PLAYERS}
        presetId="splittet-cup-dag"
      />,
    );

    // Steg 1: 2 på Ørnen, 2 på Falken.
    const toTeam1 = screen.getAllByRole('button', { name: 'Ørnen' });
    fireEvent.click(toTeam1[0]);
    fireEvent.click(toTeam1[1]);
    const toTeam2 = screen.getAllByRole('button', { name: 'Falken' });
    fireEvent.click(toTeam2[2]);
    fireEvent.click(toTeam2[3]);

    // Steg 2: bunt-preview — én flight (greensome + best ball + 2 singler).
    fireEvent.click(screen.getByRole('button', { name: /neste/i }));
    expect(screen.getByTestId('cup-wizard-step2')).toBeInTheDocument();
    expect(screen.getByTestId('cup-wizard-step2-bundle')).toBeInTheDocument();
    expect(screen.getByText(/flight 1/i)).toBeInTheDocument();

    // Greensomens manuelle lag-slag-felt, ett per lag — FORHÅNDSUTFYLT med
    // 60/40-forslaget (#1441 owner-QA, D10): tee-1 mangler ratingsett, så
    // fallback er rå HCP-indeks. Ørnen: greensomeTeamHandicap(12.0, 18.0) = 14.
    // Falken: greensomeTeamHandicap(8.5, 24.0) = 15.
    const strokesFields = screen.getAllByLabelText(/slag til lag/i);
    expect(strokesFields).toHaveLength(2);
    expect(strokesFields[0]).toHaveValue(14);
    expect(strokesFields[1]).toHaveValue(15);

    // Matchup-radene (#1441 owner-QA rebuild, F3e): to rader, fire selects —
    // venstre kolonne lag 1, høyre lag 2, samme rad = singles-motstandere.
    // Default: Kari/Ola (Ørnen), Lars/Ida (Falken) → rad 0 Kari mot Lars,
    // rad 1 Ola mot Ida. Ingen egen «bytt paring»-knapp.
    expect(screen.queryByTestId('cup-wizard-swap-singles-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('cup-wizard-lineup-1-side1-0')).toHaveValue('p1');
    expect(screen.getByTestId('cup-wizard-lineup-1-side2-0')).toHaveValue('p3');
    expect(screen.getByTestId('cup-wizard-lineup-1-side1-1')).toHaveValue('p2');
    expect(screen.getByTestId('cup-wizard-lineup-1-side2-1')).toHaveValue('p4');

    // Velg Ola (p2, i dag rad 1) i rad 0s lag-1-dropdown — en lagkamerat-bytte i
    // samme flight: å velge fra den ANDRE raden ER «bytt paring».
    fireEvent.change(screen.getByTestId('cup-wizard-lineup-1-side1-0'), {
      target: { value: 'p2' },
    });
    expect(screen.getByTestId('cup-wizard-lineup-1-side1-0')).toHaveValue('p2');
    expect(screen.getByTestId('cup-wizard-lineup-1-side2-0')).toHaveValue('p3');
    expect(screen.getByTestId('cup-wizard-lineup-1-side1-1')).toHaveValue('p1');
    expect(screen.getByTestId('cup-wizard-lineup-1-side2-1')).toHaveValue('p4');
  });
});
