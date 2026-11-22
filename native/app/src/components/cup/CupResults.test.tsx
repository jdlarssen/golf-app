// Type B: en spiller som vinner to like sidepoeng på samme hull gir to rader,
// og hver rad må ha sin egen nøkkel (ellers dobles eller mistes en linje).
import { render, screen } from '@testing-library/react-native';
import { finishedCup, ME, RESULTS } from '../../test/cupFixtures';
import { CupResults } from './CupResults';

describe('CupResults', () => {
  it('to sidepoeng av samme slag på samme hull gir to linjer uten nøkkelvarsel', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const doubled = {
      ...RESULTS,
      playerGroups: [
        {
          ...RESULTS.playerGroups[0]!,
          rows: [
            {
              ...RESULTS.playerGroups[0]!.rows[0]!,
              contributions: [
                { type: 'ctp' as const, holeNumber: 7, points: 1 },
                { type: 'ctp' as const, holeNumber: 7, points: 1 },
              ],
            },
          ],
        },
      ],
    };
    await render(<CupResults view={finishedCup()} results={doubled} userId={ME} />);
    expect(screen.getAllByText("Nærmest pinnen, hull 7 · +1")).toHaveLength(2);
    const keyWarnings = errors.mock.calls.filter((call) => String(call[0]).includes('same key'));
    expect(keyWarnings).toHaveLength(0);
    errors.mockRestore();
  });
});
