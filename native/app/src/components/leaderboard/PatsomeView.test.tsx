// #2751: Patsome-tavla tegner modellen (Type C), og Hull og Par står fast når
// lagene ikke får plass.
import { render, screen, within } from '@testing-library/react-native';
import type { PatsomeBoardModel, PatsomeBoardRow } from '../../lib/patsomeBoard';
import { PatsomeView } from './PatsomeView';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}));

function row(teamNumber: number, overrides: Partial<PatsomeBoardRow> = {}): PatsomeBoardRow {
  return {
    teamNumber,
    name: `Lag ${teamNumber}`,
    place: String(teamNumber),
    leader: false,
    you: false,
    members: 'Anna, Bjørn',
    total: '37',
    under: 'poeng',
    segments: [
      { label: '4BBB', value: '16' },
      { label: 'Greensome', value: '10' },
      { label: 'Foursomes', value: '—' },
    ],
    note: null,
    a11y: `Lag ${teamNumber}`,
    ...overrides,
  };
}

function model(teamCount: number, overrides: Partial<PatsomeBoardModel> = {}): PatsomeBoardModel {
  const teams = Array.from({ length: teamCount }, (_, index) => index + 1);
  return {
    variant: 'finished',
    pill: { text: 'Sluttresultat · 18 hull', live: false },
    rows: teams.map((team) => row(team)),
    viewerTeam: 2,
    columns: teams.map((team) => ({ teamNumber: team, label: `Lag ${team}`, you: team === 2 })),
    groups: [
      {
        label: '4BBB · hull 1–6',
        holes: [{ holeNumber: 1, par: 4, cells: teams.map(() => '2'), a11y: 'Hull 1, par 4' }],
      },
      {
        label: 'Greensome · hull 7–12',
        holes: [{ holeNumber: 7, par: 5, cells: teams.map(() => '—'), a11y: 'Hull 7, par 5' }],
      },
    ],
    strip: null,
    ...overrides,
  };
}

describe('PatsomeView', () => {
  it('tegner kortene, vinneren, delsummene, «Likt med» og tabellen', async () => {
    await render(
      <PatsomeView
        model={model(4, {
          rows: [
            row(3, { leader: true, place: '1' }),
            row(2, { you: true, place: 'T2' }),
            row(4, { place: 'T2', note: 'Likt med Lag 2 · avgjort på siste ni' }),
          ],
        })}
      />,
    );

    expect(screen.getByText('Vinnerlaget')).toBeTruthy();
    expect(screen.getByTestId('board-leader-disc')).toHaveTextContent('1');
    expect(screen.getByText('Ditt lag')).toBeTruthy();
    expect(screen.getByTestId('board-tie-note')).toHaveTextContent('Likt med Lag 2 · avgjort på siste ni');
    expect(screen.getByTestId('team-row-3-segments')).toHaveTextContent('4BBB 16 · Greensome 10 · Foursomes —');

    const table = within(screen.getByTestId('patsome-holes'));
    expect(table.getByText('Hull for hull')).toBeTruthy();
    expect(table.getByText('4BBB · hull 1–6')).toBeTruthy();
    expect(table.getByText('Greensome · hull 7–12')).toBeTruthy();
    expect(table.getByTestId('patsome-hole-1')).toHaveProp('accessibilityLabel', 'Hull 1, par 4');
    // Uten rulling når lagene får plass.
    expect(screen.queryByTestId('patsome-holes-scroll')).toBeNull();
  });

  it('live: ingen «Vinnerlaget», lederen har skiva', async () => {
    await render(
      <PatsomeView model={model(2, { variant: 'live', rows: [row(1, { leader: true, place: '1' }), row(2, { place: '2' })] })} />,
    );
    expect(screen.queryByText('Vinnerlaget')).toBeNull();
    expect(screen.getByTestId('board-leader-disc')).toBeTruthy();
  });

  it('seks lag får plass, fra sju lag ruller lagene mens Hull og Par står fast', async () => {
    const { rerender } = await render(<PatsomeView model={model(6)} />);
    expect(screen.queryByTestId('patsome-holes-scroll')).toBeNull();

    await rerender(<PatsomeView model={model(7)} />);
    const scroll = screen.getByTestId('patsome-holes-scroll');
    expect(within(scroll).getByText('Lag 7', { includeHiddenElements: true })).toBeTruthy();
    expect(within(scroll).queryByText('Par', { includeHiddenElements: true })).toBeNull();
    const fixed = within(screen.getByTestId('patsome-holes-fixed'));
    expect(fixed.getByText('Hull')).toBeTruthy();
    expect(fixed.getByText('Par')).toBeTruthy();
  });
});
