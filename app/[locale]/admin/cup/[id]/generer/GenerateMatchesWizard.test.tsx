import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

// jsdom har en ekte window.localStorage — samme mønster som
// lib/theme/themePreference.test.ts, ingen egen mock trengs. Rydder mellom
// tester siden lagringen ellers deles på tvers av `it`-blokker i samme fil.
afterEach(() => {
  window.localStorage.clear();
});

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
    expect(screen.getByText(/steg 1 av 4/i)).toBeInTheDocument();

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
    expect(screen.getByText(/steg 3 av 4/i)).toBeInTheDocument();
    expect(screen.getByText(/oppsettet gir 5 matcher/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /neste/i })).toBeDisabled();
  });

  it('splittet-cup-dag: genererer flight-bunt med lag-slag-felt og matchup-rader (#1441, F3e)', () => {
    render(
      <GenerateMatchesWizard
        tournamentId="t-1"
        team1Name="Ørnen"
        team2Name="Falken"
        players={PLAYERS}
        courses={COURSES}
      />,
    );

    // Steg 1: 2 på Ørnen, 2 på Falken.
    const toTeam1 = screen.getAllByRole('button', { name: 'Ørnen' });
    fireEvent.click(toTeam1[0]);
    fireEvent.click(toTeam1[1]);
    const toTeam2 = screen.getAllByRole('button', { name: 'Falken' });
    fireEvent.click(toTeam2[2]);
    fireEvent.click(toTeam2[3]);

    // Steg 2: bane + tee + (valgfritt) tee-off-felt (#1441 owner-QA, F3d).
    fireEvent.click(screen.getByRole('button', { name: /neste/i }));
    expect(screen.getByTestId('cup-wizard-teeoff')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/velg bane/i), {
      target: { value: 'course-1' },
    });
    fireEvent.change(screen.getByLabelText(/velg tee/i), {
      target: { value: 'tee-1' },
    });

    // Steg 3: velg splittet-cup-dag-presetet.
    fireEvent.click(screen.getByRole('button', { name: /neste/i }));
    fireEvent.click(screen.getByTestId('cup-wizard-preset-splittet-cup-dag'));
    expect(screen.getByTestId('cup-wizard-splitday-setup')).toBeInTheDocument();
    expect(screen.getByLabelText(/handicap-andel best ball/i)).toHaveValue(85);

    // Steg 4: bunt-preview — én flight (4 matcher: greensome + best ball + 2 singler).
    fireEvent.click(screen.getByRole('button', { name: /neste/i }));
    expect(screen.getByTestId('cup-wizard-step4-bundle')).toBeInTheDocument();
    expect(screen.getByText(/flight 1/i)).toBeInTheDocument();
    // Greensomens manuelle lag-slag-felt, ett per lag — FORHÅNDSUTFYLT med
    // 60/40-forslaget (#1441 owner-QA, D10): tee-1 mangler ratingsett, så
    // fallback er rå HCP-indeks. Ørnen: greensomeTeamHandicap(12.0, 18.0) =
    // round(0.6×12 + 0.4×18) = 14. Falken: greensomeTeamHandicap(8.5, 24.0)
    // = round(0.6×8.5 + 0.4×24) = 15.
    const strokesFields = screen.getAllByLabelText(/slag til lag/i);
    expect(strokesFields).toHaveLength(2);
    expect(strokesFields[0]).toHaveValue(14);
    expect(strokesFields[1]).toHaveValue(15);

    // Matchup-radene (#1441 owner-QA rebuild, F3e): to rader, fire selects —
    // venstre kolonne lag 1, høyre lag 2, samme rad = singles-motstandere.
    // Default: Kari/Ola (Ørnen), Lars/Ida (Falken) → rad 0 Kari mot Lars,
    // rad 1 Ola mot Ida. Ingen egen «bytt paring»-knapp lenger.
    expect(screen.queryByTestId('cup-wizard-swap-singles-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('cup-wizard-lineup-1-side1-0')).toHaveValue('p1');
    expect(screen.getByTestId('cup-wizard-lineup-1-side2-0')).toHaveValue('p3');
    expect(screen.getByTestId('cup-wizard-lineup-1-side1-1')).toHaveValue('p2');
    expect(screen.getByTestId('cup-wizard-lineup-1-side2-1')).toHaveValue('p4');

    // Velg Ola (p2, i dag rad 1) i rad 0s lag-1-dropdown — en lagkamerat-bytte
    // i samme flight, som owner-QA-en ba om: å velge fra den ANDRE raden ER
    // «bytt paring». Greensome-paret er uendret (samme to spillere), men
    // singles-paringen følger nå spilleren til sin nye rad.
    fireEvent.change(screen.getByTestId('cup-wizard-lineup-1-side1-0'), {
      target: { value: 'p2' },
    });
    expect(screen.getByTestId('cup-wizard-lineup-1-side1-0')).toHaveValue('p2');
    expect(screen.getByTestId('cup-wizard-lineup-1-side2-0')).toHaveValue('p3');
    expect(screen.getByTestId('cup-wizard-lineup-1-side1-1')).toHaveValue('p1');
    expect(screen.getByTestId('cup-wizard-lineup-1-side2-1')).toHaveValue('p4');
  });

  it('steg 1: en pending venn (venter på profil) vises som ikke-valgbar rad (#1441, F3f)', () => {
    const withPending: WizardPlayer[] = [
      ...PLAYERS,
      { id: 'p5', displayName: 'Ukjent spiller', hcpIndex: 54.0, pending: true },
    ];

    render(
      <GenerateMatchesWizard
        tournamentId="t-1"
        team1Name="Ørnen"
        team2Name="Falken"
        players={withPending}
        courses={COURSES}
      />,
    );

    const pendingRow = screen.getByTestId('cup-wizard-pending-p5');
    expect(within(pendingRow).getByText('Venter på profil')).toBeInTheDocument();
    expect(within(pendingRow).getByText('Mangler handicap')).toBeInTheDocument();
    // Ingen lag-toggle for den pending raden.
    expect(screen.queryByTestId('cup-wizard-assign-p5-team1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cup-wizard-assign-p5-team2')).not.toBeInTheDocument();

    // Kun de 4 ordinære spillerne har en lag-toggle å klikke på.
    expect(screen.getAllByRole('button', { name: 'Ørnen' })).toHaveLength(4);

    // Pending spilleren kan ikke telle med i lagstørrelsen: å tildele de 4
    // ordinære spillerne 2/2 er nok til å komme videre fra steg 1.
    const toTeam1 = screen.getAllByRole('button', { name: 'Ørnen' });
    fireEvent.click(toTeam1[0]);
    fireEvent.click(toTeam1[1]);
    const toTeam2 = screen.getAllByRole('button', { name: 'Falken' });
    fireEvent.click(toTeam2[2]);
    fireEvent.click(toTeam2[3]);
    expect(screen.getByRole('button', { name: /neste/i })).not.toBeDisabled();
  });

  it('lagrer bane/tee/preset til localStorage og gjenoppretter dem ved retur til cupen (#1441, F3g)', () => {
    const first = render(
      <GenerateMatchesWizard
        tournamentId="t-1"
        team1Name="Ørnen"
        team2Name="Falken"
        players={PLAYERS}
        courses={COURSES}
      />,
    );
    expect(screen.queryByText('Valgene dine fra sist er hentet frem.')).not.toBeInTheDocument();

    // Fordel spillerne og fyll ut steg 2 + 3 (splittet-cup-dag + egen
    // best-ball-andel) — «setter opp cupen» før roster er ferdig fordelt.
    const toTeam1 = screen.getAllByRole('button', { name: 'Ørnen' });
    fireEvent.click(toTeam1[0]);
    fireEvent.click(toTeam1[1]);
    const toTeam2 = screen.getAllByRole('button', { name: 'Falken' });
    fireEvent.click(toTeam2[2]);
    fireEvent.click(toTeam2[3]);
    fireEvent.click(screen.getByRole('button', { name: /neste/i }));
    fireEvent.change(screen.getByLabelText(/velg bane/i), { target: { value: 'course-1' } });
    fireEvent.change(screen.getByLabelText(/velg tee/i), { target: { value: 'tee-1' } });
    fireEvent.click(screen.getByRole('button', { name: /neste/i }));
    fireEvent.click(screen.getByTestId('cup-wizard-preset-splittet-cup-dag'));
    fireEvent.change(screen.getByLabelText(/handicap-andel best ball/i), {
      target: { value: '70' },
    });

    const saved = JSON.parse(window.localStorage.getItem('cup-wizard-draft-t-1') ?? '{}');
    expect(saved.courseId).toBe('course-1');
    expect(saved.teeBoxId).toBe('tee-1');
    expect(saved.presetId).toBe('splittet-cup-dag');
    expect(saved.bestBallAllowancePct).toBe(70);

    // Organisatoren forlater og kommer tilbake til den samme cupen — roster
    // (steg 1) er BEVISST ikke gjenopprettet (live data hver gang), men
    // valgene fra steg 2+3 er tilbake med ett, pluss hintet som sier fra.
    first.unmount();
    render(
      <GenerateMatchesWizard
        tournamentId="t-1"
        team1Name="Ørnen"
        team2Name="Falken"
        players={PLAYERS}
        courses={COURSES}
      />,
    );
    expect(screen.getByText('Valgene dine fra sist er hentet frem.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Ørnen' })[0]).not.toHaveClass('bg-primary');

    fireEvent.click(screen.getAllByRole('button', { name: 'Ørnen' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Ørnen' })[1]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Falken' })[2]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Falken' })[3]);
    fireEvent.click(screen.getByRole('button', { name: /neste/i }));
    expect(screen.getByLabelText(/velg bane/i)).toHaveValue('course-1');
    expect(screen.getByLabelText(/velg tee/i)).toHaveValue('tee-1');
    fireEvent.click(screen.getByRole('button', { name: /neste/i }));
    expect(screen.getByTestId('cup-wizard-preset-splittet-cup-dag')).toBeChecked();
    expect(screen.getByLabelText(/handicap-andel best ball/i)).toHaveValue(70);
  });
});
