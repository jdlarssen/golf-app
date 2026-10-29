// #2675: sjekklista før en simulatorrunde (Type B): bane og tee øverst, så de
// åtte innstillingene i Trackmans rekkefølge, uten fold og uten merke.
import { render, screen } from '@testing-library/react-native';
import { leagueRound } from '../../test/leagueFixtures';
import { RoundSetupChecklist } from './RoundSetupChecklist';

const ROWS = [
  ['round-setup-setting-pins', 'FlaggplasseringMedium'],
  ['round-setup-setting-putting', 'PuttingAuto - Tour Pro'],
  ['round-setup-setting-gimme', 'Gimme-avstandNot applicable'],
  ['round-setup-setting-mulligans', 'MulligansNo'],
  ['round-setup-setting-wind', 'VindCalm'],
  ['round-setup-setting-fairway_firmness', 'Fairway-hardhetMedium'],
  ['round-setup-setting-green_firmness', 'Green-hardhetMedium'],
  ['round-setup-setting-green_stimp', 'Greenhastighet12 (3,7 m)'],
] as const;

it('bane og tee øverst, så Game og Course med alle åtte verdiene i rekkefølge', async () => {
  await render(<RoundSetupChecklist round={leagueRound(3, -2)} />);
  expect(screen.getByText('Sett dette i Trackman før første slag')).toBeTruthy();
  expect(screen.getByTestId('round-setup-course')).toHaveTextContent('BaneSt Andrews');
  expect(screen.getByTestId('round-setup-tee')).toHaveTextContent('TeeGul');
  expect(screen.getAllByText(/^(Game|Course)$/).map((n) => n.props.children)).toEqual(['Game', 'Course']);
  for (const [id, text] of ROWS) expect(screen.getByTestId(id)).toHaveTextContent(text);

  // Rekkefølgen i treet: bane, tee, så innstillingene som i `ROWS`.
  const ids = screen.queryAllByTestId(/^round-setup-(course|tee|setting-)/).map((n) => n.props.testID);
  expect(ids).toEqual(['round-setup-course', 'round-setup-tee', ...ROWS.map(([id]) => id)]);
});

it('lista er lik med og uten overstyrte verdier, og har ingen merke eller fold', async () => {
  await render(<RoundSetupChecklist round={leagueRound(3, -2, { overriddenKeys: ['green_stimp', 'wind', 'pins'] })} />);
  for (const [id, text] of ROWS) expect(screen.getByTestId(id)).toHaveTextContent(text);
  expect(screen.queryByText('Endret denne runden')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

it('mangler bane eller tee, faller raden bort; mangler begge, faller boksen bort', async () => {
  const { rerender } = await render(<RoundSetupChecklist round={leagueRound(3, -2, { courseName: null })} />);
  expect(screen.queryByTestId('round-setup-course')).toBeNull();
  expect(screen.getByTestId('round-setup-tee')).toBeTruthy();

  await rerender(<RoundSetupChecklist round={leagueRound(3, -2, { courseName: null, teeName: null })} />);
  expect(screen.queryByTestId('round-setup-where')).toBeNull();
  expect(screen.getByTestId('round-setup-setting-wind')).toBeTruthy();
});
