// #2265: dagboka i Rundedagboka. Type C — bare strukturen: månedene, radene,
// medaljongen eller ringen, og at en rad åpner resultatlista. Underlinja og
// medaljeregelen er Type A i `lib/roundDiary.test.ts`.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { groupDiaryByMonth } from '../../lib/roundDiary';
import { historyRound, localIso } from '../../test/historyFixtures';
import { RoundDiaryList } from './RoundDiaryList';

const place = (rank: number, fieldSize = 8) =>
  ({ kind: 'placement', rank, fieldSize, isTeam: false }) as const;

const ROUNDS = [
  historyRound({
    gameId: 'stableford',
    date: localIso(8, 19),
    gameMode: 'stableford',
    resultSummary: place(1),
  }),
  historyRound({
    gameId: 'scramble',
    date: localIso(8, 12),
    name: 'Firmagolfen',
    gameMode: 'texas_scramble',
    teamBall: true,
    holeCount: 0,
    brutto: null,
    completeBrutto: null,
    resultSummary: { kind: 'placement', rank: 2, fieldSize: 5, isTeam: true },
  }),
  historyRound({
    gameId: 'nine',
    date: localIso(8, 16),
    holeSegment: 'back9',
    holeCount: 9,
    brutto: 42,
    completeBrutto: null,
    resultSummary: place(3, 6),
  }),
  historyRound({ gameId: 'club', date: localIso(7, 29), resultSummary: place(4, 12) }),
  historyRound({
    gameId: 'match',
    date: localIso(6, 1, 12, 0, 2025),
    gameMode: 'singles_matchplay',
    resultSummary: { kind: 'matchplay', outcome: 'win', margin: '3&2' },
  }),
];

describe('RoundDiaryList', () => {
  it('lists the months, the rows and the place on the right, and opens a round', async () => {
    const onOpenRound = jest.fn();
    await render(
      <RoundDiaryList
        months={groupDiaryByMonth(ROUNDS)}
        currentYear={2026}
        points={new Map([['stableford', 38]])}
        onOpenRound={onOpenRound}
      />,
    );

    // Månedene i år står uten årstall; et eldre år får det.
    expect(screen.getByText('september')).toBeTruthy();
    expect(screen.getByText('august')).toBeTruthy();
    expect(screen.getByText('juli 2025')).toBeTruthy();

    expect(screen.getByTestId('diary-row-line-stableford')).toHaveTextContent(
      'Byneset North · Stableford · 38 p',
    );
    expect(screen.getByTestId('diary-row-line-scramble')).toHaveTextContent(
      'Byneset North · Texas scramble · lag',
    );
    expect(screen.getByTestId('diary-row-line-nine')).toHaveTextContent('Byneset North · 9 hull · 42 brutto');

    // Medaljong på 1–3, ring fra 4, og matchplay i ord.
    const hidden = { includeHiddenElements: true } as const;
    expect(screen.getByTestId('diary-result-stableford-gold', hidden)).toBeTruthy();
    expect(screen.getByTestId('diary-result-scramble-silver', hidden)).toBeTruthy();
    expect(screen.getByTestId('diary-result-nine-bronze', hidden)).toBeTruthy();
    expect(screen.getByTestId('diary-result-club-ring', hidden)).toBeTruthy();
    expect(screen.getByTestId('diary-result-club', hidden)).toHaveTextContent('4av 12');
    expect(screen.getByTestId('diary-result-match', hidden)).toHaveTextContent('Du vant 3&2');

    // Hver rad er én setning for skjermleseren.
    const row = screen.getByTestId('diary-row-stableford');
    expect(row.props.accessibilityLabel).toBe(
      'Lørdag 19. september, Lørdagsrunden, Byneset North, Stableford, 38 poeng, 1. plass av 8',
    );
    await fireEvent.press(row);
    expect(onOpenRound).toHaveBeenCalledWith('stableford');
  });
});
