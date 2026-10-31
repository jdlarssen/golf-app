// #2712 (Type B, orkestratoren 31.10 etter eierens regel): en ligarunde spilt
// alene har ingen plass og ingen seier. Tavla tegnet fra modellen viser
// poengene og «Godkjent», uten gullskive og uten «Vinner».
import { render, screen } from '@testing-library/react-native';
import { holeScores, homeBundle, homePlayer } from '../../test/homeFixtures';
import { soloBoardFor } from '../../lib/soloBoard';
import { BoardStrip, SoloBoard } from './SoloBoard';

const ME = 'me';

function modelFor(leagueRoundId: string | null) {
  return soloBoardFor({
    bundle: homeBundle({
      game: { status: 'finished', leagueRoundId },
      players: [homePlayer({ userId: ME, name: 'Siri Solo' })],
    }),
    scores: holeScores('g-live', ME, 18, 4),
    userId: ME,
  })!;
}

it('ligarunde alene: poengene og «Godkjent», ingen gullskive eller «Vinner»', async () => {
  const model = modelFor('round-1');
  await render(<SoloBoard model={model} />);
  expect(screen.getByTestId(`board-row-${ME}-total`)).toHaveTextContent('36');
  expect(screen.queryByTestId('board-leader-disc')).toBeNull();
  expect(screen.queryByText('Vinner')).toBeNull();

  await render(<BoardStrip strip={model.strip!} finished onAction={() => {}} bottom={0} />);
  expect(screen.getByText('Godkjent')).toBeTruthy();
  expect(screen.queryByText(/plass/)).toBeNull();
});

it('samme runde utenfor en liga kårer vinneren som før', async () => {
  await render(<SoloBoard model={modelFor(null)} />);
  expect(screen.getByTestId('board-leader-disc')).toBeTruthy();
  expect(screen.getByText('Vinner')).toBeTruthy();
});
