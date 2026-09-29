// #2262: den ene render-testen (Type C) på det klassiske scorekortet.
//
// Den låser STRUKTUR, ikke tall: tallene er `lib/scorecard/scorecardGrid.test.ts`
// sine. Det som bare kan svares her:
//
// 1. Ett kort per halvdel, og bare for halvdelene som har hull.
// 2. Radene står i den rekkefølgen skjermen ber om, og hver kolonne har én
//    celle per rad — ni hull og SUM, altså ti kolonner.
// 3. Skjermleseren får kolonnene, ikke etikettene: hvert hull er ett element
//    med samlet tekst, og radetikettene er skjult.
import { render, screen, within } from '@testing-library/react-native';
import { buildScorecardGrid } from '../../../../../lib/scorecard/scorecardGrid';
import { ScorecardGrid } from './ScorecardGrid';

const HIDDEN = { includeHiddenElements: true };

const ROWS = Array.from({ length: 18 }, (_, i) => ({
  holeNumber: i + 1,
  par: 4,
  strokes: i === 4 ? null : 4 + (i % 3) - 1,
  extra: 1,
}));

describe('ScorecardGrid', () => {
  it('tegner UT og INN med radene i rekkefølge, ti kolonner, og kolonnene som skjermleser-elementer', async () => {
    const grid = buildScorecardGrid({ rows: ROWS, pointsFn: null });
    const { rerender } = await render(
      <ScorecardGrid
        grid={grid}
        rows={['strokes', 'net', 'enteredBy']}
        enteredBy={new Map([[1, { initials: 'KN', fullName: 'Kari Nordmann' }]])}
      />,
    );

    // 1: to kort.
    expect(screen.getByTestId('scorecard-half-out')).toBeTruthy();
    expect(screen.getByTestId('scorecard-half-in')).toBeTruthy();

    // 2: etikettene i rekkefølge på hvert kort, og ti kolonner med like mange
    // celler som etiketter.
    for (const key of ['out', 'in'] as const) {
      const labels = within(screen.getByTestId(`scorecard-labels-${key}`, HIDDEN)).getAllByTestId(
        /^scorecard-row-label-/,
        HIDDEN,
      );
      expect(labels.map((label) => label.props.testID)).toEqual([
        'scorecard-row-label-hole',
        'scorecard-row-label-par',
        'scorecard-row-label-strokes',
        'scorecard-row-label-net',
        'scorecard-row-label-enteredBy',
      ]);
      const half = within(screen.getByTestId(`scorecard-half-${key}`));
      const columns = [
        ...half.getAllByTestId(/^scorecard-col-\d+$/),
        half.getByTestId(`scorecard-sum-${key}`),
      ];
      expect(columns).toHaveLength(10);
      for (const column of columns) {
        expect(column.children).toHaveLength(labels.length);
      }
    }

    // 3: kolonnene er skjermleser-elementer med tekst; etikettene er skjult.
    const hole1 = screen.getByTestId('scorecard-col-1');
    expect(hole1.props.accessible).toBe(true);
    expect(hole1.props.accessibilityLabel).toEqual(expect.stringContaining('Kari Nordmann'));
    expect(screen.queryByTestId('scorecard-labels-out')).toBeNull();

    // En ni-hullsrunde har bare ett kort.
    await rerender(
      <ScorecardGrid
        grid={buildScorecardGrid({ rows: ROWS.slice(9), pointsFn: null })}
        rows={['strokes']}
      />,
    );
    expect(screen.queryByTestId('scorecard-half-out')).toBeNull();
    expect(screen.getByTestId('scorecard-half-in')).toBeTruthy();
  });
});
