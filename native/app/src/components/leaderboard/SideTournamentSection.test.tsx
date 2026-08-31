// Native (#1850): den ene render-testen (Type C) på sideturnerings-seksjonen.
//
// Den asserter STRUKTUR, ikke tall. Poengene er dekket av `lib/scoring`-suiten
// og av `buildSideTournament`s egne tester; å telle dem om igjen her ville låst
// samme regel to steder.
//
// Fire ting kan bare denne testen svare på — alle fire er steder hvor en rimelig
// implementasjon gjør feil ting:
//
//  1. Samme spiller på BEGGE LD-slotene gir to linjer. `position` er hull-slot,
//     ikke plassering, så en de-dupe på vinner ville spist en premie.
//  2. En slot uten kåret vinner gir INGEN linje — ikke «ingen ennå».
//  3. Tomme grupper forsvinner; seks overskrifter der bare to har innhold er
//     ikke en tavle, det er et skjema.
//  4. Uten vinnerradene byttes hele tavla ut med den ærlige noten. Hver slot er
//     verdt 2p, så alternativet er en tabell med feil totaler.
//
// RNTL 14 er asynkron hele veien: både `render`, `rerender` og `fireEvent`
// returnerer promises, og `screen` er tom til den er ventet på.
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  SideTournamentSection,
  SIDE_WINNERS_UNAVAILABLE_MESSAGE,
  type SideTournamentSectionProps,
} from './SideTournamentSection';

// Lag 1 er et makkerpar, Lag 2 er én mann alene — de to radtitlene følger ulike
// regler, og begge står i samme fixture.
const props: SideTournamentSectionProps = {
  teams: [
    {
      teamId: 1,
      label: 'Lag 1',
      members: [
        { userId: 'per', displayName: 'Per Hansen', firstName: 'Per' },
        { userId: 'kari', displayName: 'Kari Dahl', firstName: 'Kari' },
      ],
    },
    {
      teamId: 2,
      label: 'Lag 2',
      members: [
        { userId: 'ola', displayName: 'Ola Nordmann', firstName: 'Ola' },
      ],
    },
  ],
  result: {
    teamStandings: [
      {
        teamId: 1,
        totalPoints: 16,
        awards: [
          { category: 'best_netto_18', teamId: 1, points: 10 },
          { category: 'hole_win', teamId: 1, points: 2, holeNumber: 4 },
        ],
      },
      {
        teamId: 2,
        totalPoints: -2,
        awards: [
          { category: 'snowman', teamId: 2, points: -2, holeNumber: 12, score: 6 },
        ],
      },
    ],
  },
  ldCount: 2,
  ctpCount: 1,
  // Per tok begge drivene. CTP-sloten står ukåret.
  sideWinners: [
    { category: 'longest_drive', position: 1, winnerUserId: 'per' },
    { category: 'longest_drive', position: 2, winnerUserId: 'per' },
    { category: 'closest_to_pin', position: 1, winnerUserId: null },
  ],
  coursePars: new Array(18).fill(4),
  disabledCategories: [],
};

describe('SideTournamentSection', () => {
  it('viser begge LD-slotene, hopper over den ukårede, dropper tomme grupper — og bytter tavla mot noten når vinnerne mangler', async () => {
    const { rerender } = await render(<SideTournamentSection {...props} />);

    // 1 + 2: én linje per KÅRET slot. Samme mann to ganger er to premier.
    expect(screen.getByTestId('side-headline-ld-1')).toHaveTextContent(/#1.*Per/);
    expect(screen.getByTestId('side-headline-ld-2')).toHaveTextContent(/#2.*Per/);
    expect(screen.queryByTestId('side-headline-ctp-1')).toBeNull();

    // Radtitlene: makkerparet står som «Lag 1» med fornavnene under, mannen
    // alene som seg selv — uten en undertittel som gjentar navnet hans.
    expect(screen.getByText('Lag 1')).toBeTruthy();
    expect(screen.getByText('Per · Kari')).toBeTruthy();
    expect(screen.getByText('Ola Nordmann')).toBeTruthy();
    expect(screen.queryByText('Lag 2')).toBeNull();
    expect(screen.queryByText('Ola')).toBeNull();

    // Lukket rad: ingen utdelinger på skjermen.
    expect(screen.queryByTestId('side-team-1-group-hull')).toBeNull();

    await fireEvent.press(screen.getByTestId('side-team-1-toggle'));

    // 3: to grupper har innhold, fire har ikke — og de fire finnes ikke.
    expect(screen.getByTestId('side-team-1-group-hovedkonkurranser')).toBeTruthy();
    expect(screen.getByTestId('side-team-1-group-hull')).toBeTruthy();
    for (const empty of ['skill', 'moderate', 'achievements', 'penalty']) {
      expect(screen.queryByTestId(`side-team-1-group-${empty}`)).toBeNull();
    }
    // Begge drivene havner hos Pers lag, som to egne linjer.
    expect(screen.getByTestId('side-award-1-ld_1')).toBeTruthy();
    expect(screen.getByTestId('side-award-1-ld_2')).toBeTruthy();

    // 4: uten vinnerradene er tavla borte, ikke bare LD-linjene.
    await rerender(<SideTournamentSection {...props} sideWinnersUnavailable />);

    expect(
      screen.getByTestId('side-tournament-unavailable'),
    ).toHaveTextContent(SIDE_WINNERS_UNAVAILABLE_MESSAGE);
    expect(screen.queryByTestId('side-team-1')).toBeNull();
    expect(screen.queryByTestId('side-headline-ld-1')).toBeNull();

    // 5: MENS vi venter er hverken tavla eller noten sann — tavla mangler 2p
    // per slot, og noten ville meldt en feil som ikke har skjedd. Seksjonen
    // holder kjeft til svaret er inne.
    await rerender(
      <SideTournamentSection {...props} sideWinnersLoading />,
    );

    expect(screen.queryByTestId('side-tournament-section')).toBeNull();
    expect(screen.queryByTestId('side-tournament-unavailable')).toBeNull();
  });
});
