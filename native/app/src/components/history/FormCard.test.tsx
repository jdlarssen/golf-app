// #2265: formkortet i Rundedagboka. Type C — bare strukturen: hvilke deler
// som står i hvilken tilstand. Tallene (`compareRecentForm`, `isNewRecord`,
// geometrien) er Type A i `lib/stats/scoringTrend.test.ts`, og ordlyden er
// `historyCopy.test.ts` sin, så testen leser copyen gjennom de samme
// funksjonene.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { SeasonSummary } from '../../../../../lib/stats/seasonStats';
import { EMPTY_ACHIEVEMENTS } from '../../../../../lib/stats/achievements';
import { HISTORY_TEXT, bestLabel, formCurveLabel, formSentence } from '../../lib/historyCopy';
import { FormCard } from './FormCard';

const SEASON: SeasonSummary = {
  year: 2026,
  rounds: 16,
  grossAverage: 87,
  bestRound: 82,
  achievements: EMPTY_ACHIEVEMENTS,
};

/** Tallene ved prikkene er skjult for skjermleseren; kurven har én etikett. */
const HIDDEN = { includeHiddenElements: true } as const;

/** Ti hele runder: 91,2 i snitt før, 87,4 de fem siste (3,8 bedre). */
const TEN = [92, 90, 91, 93, 90, 88, 87, 88, 86, 88];

/** Kurven tegnes først når bredden er målt, som på telefonen. */
async function layOut() {
  await fireEvent(screen.getByTestId('form-curve'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 326, height: 124 } },
  });
}

describe('FormCard', () => {
  it('shows the sentence, the curve with the best round and the season strip', async () => {
    await render(<FormCard series={[...TEN, 82]} season={SEASON} seasonAverage={86.6} />);
    await layOut();

    expect(screen.getByText('Formen din')).toBeTruthy();
    expect(screen.getByText(HISTORY_TEXT.formScope)).toBeTruthy();
    expect(screen.getByTestId('form-card-sentence')).toHaveTextContent(
      `▲ ${formSentence(compare([...TEN, 82]))}`,
    );
    const curve = screen.getByTestId('form-curve');
    expect(curve.props.accessibilityRole).toBe('image');
    expect(curve.props.accessibilityLabel).toBe(formCurveLabel(11, 92, 82));
    // Den nyeste er lavere enn alle før: ny rekord.
    expect(screen.getByTestId('form-curve-best-label', HIDDEN)).toHaveTextContent(bestLabel('82', true));
    expect(screen.getByTestId('form-curve-start', HIDDEN)).toHaveTextContent('92');
    expect(screen.getByTestId('form-card-strip')).toHaveTextContent('16runder86,6snitt brutto82beste runde');
  });

  it('says «beste» when the newest round is not a new record', async () => {
    await render(<FormCard series={[...TEN, 89]} season={SEASON} seasonAverage={86.6} />);
    await layOut();

    expect(screen.getByTestId('form-curve-best-label', HIDDEN)).toHaveTextContent(bestLabel('86', false));
  });

  it('writes a worse form in the muted colour, pointing down', async () => {
    await render(
      <FormCard series={[86, 86, 86, 86, 86, 88, 88, 88, 88, 88]} season={SEASON} seasonAverage={87} />,
    );

    expect(screen.getByTestId('form-card-sentence')).toHaveTextContent(`▼ ${formSentence(-2)}`);
  });

  it('has no sentence under ten rounds, or when the form is unchanged', async () => {
    await render(<FormCard series={TEN.slice(1)} season={SEASON} seasonAverage={87} />);
    expect(screen.queryByTestId('form-card-sentence')).toBeNull();

    await render(<FormCard series={Array(10).fill(88)} season={SEASON} seasonAverage={88} />);
    expect(screen.queryByTestId('form-card-sentence')).toBeNull();
  });

  it('shows a short line instead of the curve under two complete rounds', async () => {
    await render(<FormCard series={[88]} season={SEASON} seasonAverage={88} />);

    expect(screen.queryByTestId('form-curve')).toBeNull();
    expect(screen.getByTestId('form-card-too-few')).toHaveTextContent(HISTORY_TEXT.formTooFew);
  });

  it('shows dashes when the season has no complete round', async () => {
    await render(
      <FormCard
        series={[]}
        season={{ ...SEASON, rounds: 2, grossAverage: null, bestRound: null }}
        seasonAverage={null}
      />,
    );

    expect(screen.getByTestId('form-card-strip')).toHaveTextContent('2runder–snitt brutto–beste runde');
  });
});

function compare(series: readonly number[]): number {
  // Samme tall som kortet regner: snitt av de fem før minus de fem siste.
  const last = series.slice(-5);
  const before = series.slice(-10, -5);
  const mean = (v: readonly number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  return Math.round((mean(before) - mean(last)) * 10) / 10;
}
